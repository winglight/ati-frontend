import type { RiskRuleItem } from '@features/dashboard/types';
import type {
  RiskEventItem,
  RiskRuleMetrics,
  RiskMetricsSummary
} from '@features/risk/types';
import { resolveRequestUrl } from './config.js';

export interface RiskRuleAtrConfigPayload {
  lookback?: number | null;
  bar_minutes?: number | null;
  stream_interval?: number | null;
  update_throttle?: number | null;
  multiplier_sl?: number | null;
  multiplier_tp?: number | null;
  multiplier?: number | null;
  take_profit_multiplier?: number | null;
  delta_threshold?: number | null;
}

export interface RiskRuleTrailingPayload {
  price_distance?: number | null;
  percent?: number | null;
  atr_multiplier?: number | null;
}

export interface RiskRulePayload {
  id?: string;
  rule_id?: string;
  symbol?: string | null;
  db_id?: number | null;
  enabled: boolean;
  position_limit?: {
    max_net?: number | null;
    max_long?: number | null;
    max_short?: number | null;
  } | null;
  loss_limit?: {
    max_unrealized?: number | null;
    max_unrealized_pct?: number | null;
  } | null;
  stop_loss_offset?: number | null;
  take_profit_offset?: number | null;
  trailing_stop?: RiskRuleTrailingPayload | null;
  atr_params?: RiskRuleAtrConfigPayload | null;
  notes?: string | null;
  max_time_span?: number | string | null;
  rule_type?: string | null;
}

export interface RiskRuleResponsePayload {
  rule?: RiskRulePayload | null;
}

export interface RiskRuleListResponse {
  items: RiskRulePayload[];
}

export interface RiskEventPayload {
  id?: string;
  rule_id?: string;
  rule?: { id?: string | null } | null;
  symbol: string;
  message: string;
  level: string;
  created_at: string;
  metrics?: Record<string, number | string | null> | null;
  actions?: Array<{
    action: string;
    symbol: string;
    side?: string | null;
    quantity?: number | null;
    description?: string | null;
  }> | null;
}

export interface RiskEventsResponse {
  items: RiskEventPayload[];
}

export interface RiskRuleEventsResponse {
  items: RiskEventPayload[];
}

export interface RiskRuleMetricsPayload {
  events: number;
  last_event_at?: string | null;
  levels?: Record<string, number>;
  actions?: Record<string, number>;
  metrics?: Record<string, number>;
}

export interface RiskMetricsPayload {
  total_events: number;
  events_by_level: Record<string, number>;
  actions: Record<string, number>;
  last_event_at?: string | null;
  tracked_metrics: Record<string, number>;
  rules: Record<string, RiskRuleMetricsPayload>;
}

export class RiskApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RiskApiError';
  }
}

const extractErrorMessage = (bodyText: string, status: number): string | null => {
  if (!bodyText) {
    return null;
  }
  try {
    const payload = JSON.parse(bodyText) as unknown;
    if (typeof payload === 'string' && payload.trim()) {
      return payload;
    }
    if (payload && typeof payload === 'object') {
      const data = payload as { detail?: unknown; message?: unknown };
      if (typeof data.message === 'string' && data.message.trim()) {
        return data.message;
      }
      const detail = data.detail;
      if (typeof detail === 'string' && detail.trim()) {
        return detail;
      }
      if (Array.isArray(detail)) {
        const messages = detail
          .map((item) => {
            if (typeof item === 'string') {
              return item;
            }
            if (item && typeof item === 'object') {
              const record = item as { msg?: unknown; loc?: unknown };
              const location = Array.isArray(record.loc)
                ? record.loc.filter((part) => typeof part === 'string').join('.')
                : undefined;
              const message = typeof record.msg === 'string' ? record.msg : undefined;
              if (message && location) {
                return `${location}: ${message}`;
              }
              if (message) {
                return message;
              }
            }
            return null;
          })
          .filter((value): value is string => Boolean(value && value.trim()));
        if (messages.length > 0) {
          return messages.join('；');
        }
      }
    }
  } catch (error) {
    console.warn('Failed to parse risk API error payload:', error);
  }
  if (status === 422) {
    return '请求参数校验失败 (422)';
  }
  return null;
};

const fetchJson = async <T>(
  path: string,
  token: string,
  options: RequestInit = {}
): Promise<T> => {
  const url = resolveRequestUrl(path);
  const headers: HeadersInit = {
    Accept: 'application/json',
    Authorization: `Bearer ${token}`,
    ...(options.headers ?? {})
  };
  if (options.body && !(headers as Record<string, string>)['Content-Type']) {
    (headers as Record<string, string>)['Content-Type'] = 'application/json';
  }

  const response = await fetch(url, {
    ...options,
    headers
  });

  if (response.status === 401) {
    throw new RiskApiError('风控接口认证失败');
  }
  const text = await response.text();
  if (!response.ok) {
    const detailMessage = extractErrorMessage(text, response.status);
    throw new RiskApiError(detailMessage ?? `请求风控接口失败 (${response.status})`);
  }
  if (!text) {
    return JSON.parse('{}') as T;
  }

  try {
    return JSON.parse(text) as T;
  } catch (_error) {
    throw new RiskApiError('解析风控接口响应失败');
  }
};

const toRuleMetrics = (payload?: RiskRuleMetricsPayload): RiskRuleMetrics | null => {
  if (!payload) {
    return null;
  }
  return {
    events: payload.events ?? 0,
    lastEventAt: payload.last_event_at ?? null,
    levels: payload.levels ?? {},
    actions: payload.actions ?? {},
    metrics: payload.metrics ?? {}
  };
};

const toAtrConfig = (
  payload?: RiskRuleAtrConfigPayload | null
): RiskRuleItem['atrConfig'] => {
  if (!payload) {
    return null;
  }
  return {
    lookback: payload.lookback ?? null,
    barMinutes: payload.bar_minutes ?? null,
    streamInterval: payload.stream_interval ?? null,
    updateThrottle: payload.update_throttle ?? null,
    multiplierSl: payload.multiplier_sl ?? payload.multiplier ?? null,
    multiplierTp: payload.multiplier_tp ?? payload.take_profit_multiplier ?? null,
    deltaThreshold: payload.delta_threshold ?? null
  };
};

export const mapRiskRule = (
  payload: RiskRulePayload,
  metricsMap: Record<string, RiskRuleMetricsPayload> | undefined
): RiskRuleItem => {
  const trailing = payload.trailing_stop ?? null;
  const atrConfig = toAtrConfig(payload.atr_params ?? null);
  const dbId = payload.db_id ?? null;
  const ruleId =
    payload.id ??
    payload.rule_id ??
    payload.symbol ??
    (dbId != null ? String(dbId) : `rule-${Math.random().toString(36).slice(2, 10)}`);
  const metrics = toRuleMetrics(metricsMap?.[ruleId]);
  const maxTimeSpanRaw = payload.max_time_span ?? null;
  let maxTimeSpan: string | null = null;
  if (typeof maxTimeSpanRaw === 'number' && Number.isFinite(maxTimeSpanRaw)) {
    maxTimeSpan = String(Math.max(0, Math.floor(maxTimeSpanRaw)));
  } else if (typeof maxTimeSpanRaw === 'string') {
    maxTimeSpan = maxTimeSpanRaw;
  }
  const ruleType = (payload.rule_type ?? '').toLowerCase();
  let type: RiskRuleItem['type'];
  if (ruleType === 'atr_trailing') {
    type = 'atr_trailing';
  } else if (ruleType === 'trailing' || trailing) {
    type = 'trailing';
  } else {
    type = 'fixed';
  }
  const atrMultiplier = trailing?.atr_multiplier ?? atrConfig?.multiplierSl ?? null;
  return {
    id: ruleId,
    dbId,
    symbol: payload.symbol ?? null,
    type,
    enabled: payload.enabled,
    stopLossOffset: normalizeDirectionalOffset(payload.stop_loss_offset),
    takeProfitOffset: normalizeDirectionalOffset(payload.take_profit_offset),
    trailingDistance: trailing?.price_distance ?? null,
    trailingPercent: trailing?.percent ?? null,
    atrMultiplier,
    maxTimeSpan,
    positionLimit: payload.position_limit
      ? {
          maxNet: payload.position_limit.max_net ?? null,
          maxLong: payload.position_limit.max_long ?? null,
          maxShort: payload.position_limit.max_short ?? null
        }
      : null,
    lossLimit: payload.loss_limit
      ? {
          maxUnrealized: payload.loss_limit.max_unrealized ?? null,
          maxUnrealizedPct: payload.loss_limit.max_unrealized_pct ?? null
        }
      : null,
    notes: payload.notes ?? null,
    metrics,
    atrConfig
  };
};

export const mapRiskRules = (
  items: RiskRulePayload[],
  metricsMap: Record<string, RiskRuleMetricsPayload> | undefined
): RiskRuleItem[] => {
  return items.map((item) => mapRiskRule(item, metricsMap));
};

const normalizeEvent = (payload: RiskEventPayload): RiskEventItem => {
  const ruleId = payload.rule_id ?? payload.rule?.id ?? payload.id ?? 'unknown';
  return {
    id: payload.id ?? `${ruleId}:${payload.created_at}`,
    ruleId,
    symbol: payload.symbol,
    level: payload.level,
    message: payload.message,
    createdAt: payload.created_at,
    metrics: payload.metrics ?? null,
    actions: Array.isArray(payload.actions)
      ? payload.actions.map((action) => ({
          action: action.action,
          symbol: action.symbol,
          side: action.side ?? null,
          quantity: action.quantity ?? null,
          description: action.description ?? null
        }))
      : []
  };
};

export const mapRiskEvents = (items: RiskEventPayload[]): RiskEventItem[] => {
  return items
    .map(normalizeEvent)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
};

export const mapRiskMetrics = (payload: RiskMetricsPayload): RiskMetricsSummary => {
  const rules: Record<string, RiskRuleMetrics> = {};
  for (const [ruleId, metrics] of Object.entries(payload.rules ?? {})) {
    rules[ruleId] = toRuleMetrics(metrics) ?? {
      events: 0,
      lastEventAt: null,
      levels: {},
      actions: {},
      metrics: {}
    };
  }
  return {
    totalEvents: payload.total_events ?? 0,
    eventsByLevel: payload.events_by_level ?? {},
    actions: payload.actions ?? {},
    lastEventAt: payload.last_event_at ?? null,
    trackedMetrics: payload.tracked_metrics ?? {},
    rules
  };
};

export interface RiskRuleAtrConfigInput {
  lookback?: number | null;
  barMinutes?: number | null;
  streamInterval?: number | null;
  updateThrottle?: number | null;
  multiplierSl?: number | null;
  multiplierTp?: number | null;
  deltaThreshold?: number | null;
}

export interface UpsertRiskRuleInput {
  ruleId?: string;
  dbId?: number | null;
  symbol?: string | null;
  enabled: boolean;
  type: 'fixed' | 'trailing' | 'atr_trailing';
  stopLossOffset?: number | null;
  takeProfitOffset?: number | null;
  trailingDistance?: number | null;
  trailingPercent?: number | null;
  maxTimeSpan?: string | null;
  positionLimit?: {
    maxNet?: number | null;
    maxLong?: number | null;
    maxShort?: number | null;
  } | null;
  lossLimit?: {
    maxUnrealized?: number | null;
    maxUnrealizedPct?: number | null;
  } | null;
  notes?: string | null;
  atrConfig?: RiskRuleAtrConfigInput | null;
}

const normalizeLimitPayload = <T extends Record<string, number | string | null | undefined>>(input: T | null | undefined) => {
  if (!input) {
    return null;
  }
  const entries = Object.entries(input).map(([key, value]) => [key, value ?? null]);
  if (entries.every(([, value]) => value == null)) {
    return null;
  }
  return Object.fromEntries(entries) as { [K in keyof T]: T[K] | null };
};

const parseTimeSpanToMinutes = (value: string | null | undefined): number | null => {
  if (value == null) {
    return null;
  }
  const text = value.trim();
  if (!text) {
    return null;
  }

  const plainNumber = Number(text);
  if (!Number.isNaN(plainNumber) && Number.isFinite(plainNumber)) {
    return Math.max(0, Math.floor(plainNumber));
  }

  const normalized = text.toLowerCase();
  const sanitized = normalized.replace(/\s+/g, '');
  const pattern = /(\d+(?:\.\d+)?)\s*(d(?:ays?)?|h(?:ours?)?|m(?:in(?:ute)?s?)?)/g;
  let match: RegExpExecArray | null;
  let total = 0;
  let matched = '';
  while ((match = pattern.exec(normalized)) !== null) {
    matched += match[0].replace(/\s+/g, '');
    const amount = Number(match[1]);
    if (Number.isNaN(amount) || !Number.isFinite(amount)) {
      return null;
    }
    const unit = match[2];
    if (!unit) {
      return null;
    }
    if (unit.startsWith('d')) {
      total += amount * 24 * 60;
    } else if (unit.startsWith('h')) {
      total += amount * 60;
    } else {
      total += amount;
    }
  }

  if (total === 0 || matched.length === 0 || matched.length !== sanitized.length) {
    return null;
  }

  return Math.max(0, Math.floor(total));
};

const hasPositiveFiniteValue = (value: number | null | undefined): boolean => {
  return value != null && Number.isFinite(value) && value > 0;
};

const normalizeDirectionalOffset = (
  value: number | string | null | undefined
): number | null => {
  if (value == null || value === '') {
    return null;
  }
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return null;
  }
  if (numeric === 0) {
    return 0;
  }
  return numeric;
};

const serializeRiskRuleRequest = (input: UpsertRiskRuleInput): RiskRulePayload => {
  const positionLimit = normalizeLimitPayload({
    max_net: input.positionLimit?.maxNet,
    max_long: input.positionLimit?.maxLong,
    max_short: input.positionLimit?.maxShort
  });
  const lossLimit = normalizeLimitPayload({
    max_unrealized: input.lossLimit?.maxUnrealized,
    max_unrealized_pct: input.lossLimit?.maxUnrealizedPct
  });
  const hasTrailingLossLimit =
    hasPositiveFiniteValue(input.lossLimit?.maxUnrealized) ||
    hasPositiveFiniteValue(input.lossLimit?.maxUnrealizedPct);
  const atrParams = normalizeLimitPayload({
    lookback: input.atrConfig?.lookback,
    bar_minutes: input.atrConfig?.barMinutes,
    stream_interval: input.atrConfig?.streamInterval,
    update_throttle: input.atrConfig?.updateThrottle,
    multiplier: input.atrConfig?.multiplierSl,
    take_profit_multiplier: input.atrConfig?.multiplierTp,
    delta_threshold: input.atrConfig?.deltaThreshold
  }) as RiskRuleAtrConfigPayload | null;

  const trailing: RiskRuleTrailingPayload | null = (() => {
    if (input.type === 'fixed') {
      return null;
    }

    const payload: RiskRuleTrailingPayload = {
      price_distance: input.trailingDistance ?? null,
      percent: input.trailingPercent ?? null
    };

    if (input.type === 'atr_trailing') {
      payload.atr_multiplier = input.atrConfig?.multiplierSl ?? null;
    }

    if (
      payload.price_distance == null &&
      payload.percent == null &&
      (payload.atr_multiplier == null || input.type !== 'atr_trailing')
    ) {
      return null;
    }

    return payload;
  })();

  if (input.type === 'trailing' && !hasTrailingLossLimit) {
    throw new RiskApiError('跟踪规则必须设置正数的 loss_limit 以启用保护性止损。');
  }

  return {
    id: input.ruleId ?? undefined,
    symbol: input.symbol ?? null,
    db_id: input.dbId ?? null,
    enabled: input.enabled,
    position_limit: positionLimit,
    loss_limit: lossLimit,
    stop_loss_offset:
      input.type === 'fixed' ? normalizeDirectionalOffset(input.stopLossOffset) : null,
    take_profit_offset:
      input.type === 'fixed' ? normalizeDirectionalOffset(input.takeProfitOffset) : null,
    trailing_stop: trailing,
    atr_params: input.type === 'atr_trailing' ? atrParams : null,
    max_time_span: parseTimeSpanToMinutes(input.maxTimeSpan ?? null),
    notes: input.notes ?? null,
    rule_type: input.type
  };
};

export const createRiskRule = async (
  token: string,
  input: UpsertRiskRuleInput
): Promise<RiskRulePayload> => {
  const body = JSON.stringify(serializeRiskRuleRequest(input));
  const response = await fetchJson<RiskRuleResponsePayload>('/risk/rules', token, {
    method: 'POST',
    body
  });
  if (!response || typeof response !== 'object' || !response.rule) {
    throw new RiskApiError('创建风险规则后未收到有效响应');
  }
  return response.rule;
};

export const updateRiskRule = async (
  token: string,
  ruleId: string,
  input: UpsertRiskRuleInput
): Promise<RiskRulePayload> => {
  const body = JSON.stringify(serializeRiskRuleRequest({ ...input, ruleId }));
  const response = await fetchJson<RiskRuleResponsePayload>(`/risk/rules/${encodeURIComponent(ruleId)}`, token, {
    method: 'PUT',
    body
  });
  if (!response || typeof response !== 'object' || !response.rule) {
    throw new RiskApiError('更新风险规则后未收到有效响应');
  }
  return response.rule;
};

export const fetchRiskRules = async (token: string): Promise<RiskRuleListResponse> => {
  return fetchJson<RiskRuleListResponse>('/risk/rules', token, { method: 'GET' });
};

export const fetchRiskMetrics = async (token: string): Promise<RiskMetricsPayload> => {
  return fetchJson<RiskMetricsPayload>('/risk/metrics', token, { method: 'GET' });
};

export const fetchRiskEvents = async (
  token: string,
  { limit = 20 }: { limit?: number } = {}
): Promise<RiskEventsResponse> => {
  const searchParams = new URLSearchParams();
  if (limit) {
    searchParams.set('limit', limit.toString());
  }
  const query = searchParams.toString();
  const endpoint = query ? `/risk/events?${query}` : '/risk/events';
  return fetchJson<RiskEventsResponse>(endpoint, token, { method: 'GET' });
};

export const fetchRiskRuleEvents = async (
  token: string,
  ruleId: string,
  {
    limit = 20,
    action = 'close_position'
  }: { limit?: number; action?: string } = {}
): Promise<RiskRuleEventsResponse> => {
  const searchParams = new URLSearchParams();
  if (limit) {
    searchParams.set('limit', limit.toString());
  }
  if (action) {
    searchParams.set('action', action);
  }
  const query = searchParams.toString();
  const endpoint = query
    ? `/risk/rules/${encodeURIComponent(ruleId)}/events?${query}`
    : `/risk/rules/${encodeURIComponent(ruleId)}/events`;
  return fetchJson<RiskRuleEventsResponse>(endpoint, token, { method: 'GET' });
};

export interface GlobalRiskSettingsPayload {
  max_drawdown_ratio: number;
  max_loss_streak_trades: number;
  consecutive_loss_days_threshold: number;
  halt_duration_days: number;
  single_trade_max_loss?: number | null;
  daily_max_loss?: number | null;
  weekend_force_close?: boolean;
}

export interface GlobalRiskSettingsResponse {
  settings: GlobalRiskSettingsPayload;
}

export interface GlobalRiskStatusResponse {
  daily_halt: boolean;
  halt_until: string | null;
  loss_streak_trades: number;
  loss_streak_days: number;
  today_drawdown_ratio: number;
  day_date: string | null;
  timestamp: string;
}

export const fetchGlobalRiskSettings = async (
  token: string
): Promise<GlobalRiskSettingsPayload> => {
  const result = await fetchJson<GlobalRiskSettingsResponse>('/risk/global-settings', token, { method: 'GET' });
  return result.settings;
};

export const saveGlobalRiskSettings = async (
  token: string,
  input: GlobalRiskSettingsPayload
): Promise<GlobalRiskSettingsPayload> => {
  const body = JSON.stringify(input);
  const result = await fetchJson<GlobalRiskSettingsResponse>('/risk/global-settings', token, { method: 'POST', body });
  return result.settings;
};

export const fetchGlobalRiskStatus = async (
  token: string
): Promise<GlobalRiskStatusResponse> => {
  return fetchJson<GlobalRiskStatusResponse>('/risk/global-status', token, { method: 'GET' });
};
