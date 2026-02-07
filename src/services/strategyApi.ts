import type {
  StrategyFileItem,
  StrategyItem,
  StrategyMetricsSnapshot,
  StrategyOrderItem,
  StrategyPerformanceSnapshot,
  StrategyPerformanceSection,
  StrategyParameterConfig,
  StrategyScheduleConfig,
  StrategyScheduleWindow,
  StrategyTemplateItem,
  StrategyDetailSummary,
  StrategyRiskSettings,
  StrategyRiskLogEntry,
  StrategyRiskLogCheck,
  StrategyRuntimeDetail,
  StrategyRuntimeSnapshotData,
  StrategyRunnerStatus,
  StrategyPerformanceCharts,
  StrategyPnLCalendar,
  StrategyCandlesSnapshot,
  StrategyCandleSignal,
  StrategyPerformancePoint,
  StrategyDistributionPoint
} from '@features/dashboard/types';
import { resolveRequestUrl } from './config.js';
import { normalizeTimestampToUtc } from '../utils/timezone.js';

export interface StrategyTemplatePayload {
  identifier: string;
  name: string;
  description?: string | null;
  parameters?: Record<string, Record<string, unknown>> | null;
}

export interface StrategyFilePayload {
  path: string;
  name: string;
  module: string;
  metadata?: StrategyFileMetadataPayload | null;
}

export interface StrategyFileMetadataPayload {
  class_name?: string | null;
  qualified_name?: string | null;
  base_class?: string | null;
  base_class_path?: string | null;
  strategy_type?: string | null;
  strategy_name?: string | null;
  file_path?: string | null;
  description?: string | null;
  parameters?: StrategyParameterConfig[] | null;
  schedule?: {
    skip_weekends?: boolean | null;
    windows?: StrategyScheduleWindow[] | null;
  } | null;
  summary_points?: string[] | null;
}

export interface StrategyMutationPayload {
  name: string;
  symbol: string;
  mode: StrategyItem['mode'];
  templateId?: string | null;
  description?: string | null;
  skipWeekends?: boolean;
  windows?: StrategyScheduleWindow[] | null;
  parameters?: StrategyParameterConfig[] | null;
  enabled?: boolean;
  active?: boolean;
  tags?: string[] | null;
  filePath?: string | null;
  screenerProfile?: Record<string, unknown> | null;
  screenerSchedule?: Record<string, unknown> | null;
}

export interface StrategyTemplateListResponse {
  templates: StrategyTemplatePayload[];
}

export interface StrategyFileListResponse {
  files: StrategyFilePayload[];
}

export interface StrategyRecordPayload {
  id: number | string;
  name: string;
  title?: string | null;
  description?: string | null;
  file_path?: string | null;
  enabled: boolean;
  active: boolean;
  skip_weekends?: boolean | null;
  windows?: Array<Record<string, unknown>> | null;
  timezone?: string | null;
  timezone_notice?: string | null;
  parameters?: Array<Record<string, unknown>> | null;
  state?: string | null;
  mode?: string | null;
  strategy_id?: string | number | null;
  strategy_type?: string | null;
  template?: string | null;
  last_signal?: string | null;
  symbol?: string | null;
  instrument?: string | null;
  tags?: string[] | null;
  updated_at?: string | null;
  metrics?: Record<string, unknown> | null;
  metrics_updated_at?: string | null;
  primary_symbol?: string | null;
  secondary_symbol?: string | null;
  data_source?: string | null;
  data_feed_mode?: string | null;
  is_kline_strategy?: boolean | null;
  strategy_origin?: string | null;
  child_strategy_type?: string | null;
  child_parameters?: Record<string, unknown> | null;
  max_children?: number | string | null;
  selection_limit?: number | string | null;
  trigger_count?: number | string | null;
  last_triggered_at?: string | null;
  exit_config?: Array<Record<string, unknown>> | null;
  screener_profile?: Record<string, unknown> | null;
  screener_schedule?: Record<string, unknown> | null;
}

export interface StrategyListResponse {
  strategies: StrategyRecordPayload[];
}

export interface StrategyMutationWarningPayload {
  code: string;
  message: string;
}

export interface StrategyMutationResponse {
  strategy: StrategyRecordPayload;
  warnings?: StrategyMutationWarningPayload[] | null;
}

export interface StrategySubscriptionResyncResponse {
  strategy_id: string;
  strategy: string;
  refreshed: boolean;
  message?: string | null;
}

export interface StrategyOrderPayload {
  order_id?: string | null;
  strategy_id?: string | null;
  timestamp?: string | null;
  quantity?: number | string | null;
  price?: number | string | null;
  side?: string | null;
  pnl?: number | string | null;
  symbol?: string | null;
  filled_quantity?: number | string | null;
  fill_price?: number | string | null;
  avg_fill_price?: number | string | null;
  executed_at?: string | null;
  status?: string | null;
  realized_pnl?: number | string | null;
  commission?: number | string | null;
  order_source?: string | null;
  [key: string]: unknown;
}

export interface StrategyPerformanceResponse {
  strategy_id: number | string;
  id: number | string;
  name: string;
  period: string;
  market_timezone: string;
  page?: number;
  page_size?: number;
  summary?: Record<string, unknown> | null;
  orders?: {
    items?: StrategyOrderPayload[] | null;
    total?: number | null;
    page?: number | null;
    page_size?: number | null;
    has_next?: boolean | null;
  } | null;
  realtime?: Record<string, unknown> | null;
  updated_at?: string | null;
  charts?: Record<string, unknown> | null;
  calendar?: Record<string, unknown> | null;
}

export interface StrategyMetricsResponse {
  metrics?: Record<string, unknown> | null;
  period?: string | null;
  updated_at?: string | null;
  last_updated_at?: string | null;
}

export interface StrategyPerformanceParams {
  strategyId: number | string;
  period?: string;
  page?: number;
  pageSize?: number;
  sections?: StrategyPerformanceSection[];
}

export interface StrategyMetricsParams {
  strategyId: number | string;
  period?: string;
}

export interface StrategyCandlesParams {
  strategyId: number | string;
  interval?: string;
}

export interface StrategyConfigResponsePayload {
  id?: number | string | null;
  name?: string | null;
  strategy_id: string;
  strategy_type?: string | null;
  title?: string | null;
  description?: string | null;
  file_path?: string | null;
  enabled?: boolean;
  parameters?: Record<string, unknown> | null;
  parameter_definitions?: Array<Record<string, unknown>> | null;
  exit_config?: Array<Record<string, unknown>> | null;
  schedule?: {
    skip_weekends?: boolean | null;
    windows?: Array<Record<string, unknown>> | null;
    timezone?: string | null;
    timezone_notice?: string | null;
  } | null;
  strategy_origin?: string | null;
  child_strategy_type?: string | null;
  child_parameters?: Record<string, unknown> | null;
  max_children?: number | string | null;
  selection_limit?: number | string | null;
  primary_symbol?: string | null;
  secondary_symbol?: string | null;
  data_source?: string | null;
  data_feed_mode?: string | null;
  is_kline_strategy?: boolean | null;
  trigger_count?: number | null;
  last_triggered_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  screener_profile?: Record<string, unknown> | null;
  screener_schedule?: Record<string, unknown> | null;
}

export interface StrategyRuntimePayload {
  id?: number | string | null;
  strategy_id?: number | string | null;
  status?: { active?: boolean; enabled?: boolean } | null;
  snapshot?: Record<string, unknown> | null;
  runtime_snapshot?: Record<string, unknown> | null;
  runtimeSnapshot?: Record<string, unknown> | null;
  trigger_count?: number | null;
  last_triggered_at?: string | null;
}

export interface StrategyRiskSettingsPayload {
  id?: number | string | null;
  strategy_id?: number | string | null;
  max_position?: number | string | null;
  forbid_pyramiding?: boolean | null;
  loss_threshold?: number | string | null;
  loss_duration_minutes?: number | string | null;
  notify_on_breach?: boolean | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface StrategyDetailResponsePayload {
  strategy?: Record<string, unknown> | null;
  config?: StrategyConfigResponsePayload | null;
  runtime?: StrategyRuntimePayload | null;
  risk?: StrategyRiskSettingsPayload | null;
}

export interface StrategyRuntimeResponsePayload {
  id?: number | string | null;
  strategy_id?: number | string | null;
  status?: { active?: boolean; enabled?: boolean } | null;
  snapshot?: Record<string, unknown> | null;
  runtime_snapshot?: Record<string, unknown> | null;
  runtimeSnapshot?: Record<string, unknown> | null;
  trigger_count?: number | null;
  last_triggered_at?: string | null;
}

export interface StrategyCandlesPayloadGroup {
  candles?: Array<Record<string, unknown>> | null;
  signals?: Array<Record<string, unknown>> | null;
  interval?: string | null;
  interval_seconds?: number | string | null;
  duration_seconds?: number | string | null;
  refreshed_at?: string | null;
}

export interface StrategyCandlesResponse {
  symbol?: string | null;
  interval?: string | null;
  interval_seconds?: number | string | null;
  duration_seconds?: number | string | null;
  refreshed_at?: string | null;
  candles?: Array<Record<string, unknown>> | StrategyCandlesPayloadGroup | null;
  signals?: Array<Record<string, unknown>> | null;
}

export interface StrategySummaryUpdateResponse {
  summary?: StrategyConfigResponsePayload | null;
  config?: StrategyConfigResponsePayload | null;
  profile?: Record<string, unknown> | null;
  child_strategy_type?: string | null;
  child_parameters?: Record<string, unknown> | null;
  max_children?: number | string | null;
  selection_limit?: number | string | null;
}

export interface StrategyRiskSettingsResponse {
  risk_settings?: StrategyRiskSettingsPayload | null;
}

export interface StrategyRiskLogEntryPayload {
  timestamp?: string | null;
  level?: string | null;
  action?: string | null;
  status?: string | null;
  message?: string | null;
  context?: Record<string, unknown> | null;
}

export interface StrategyRiskLogsResponsePayload {
  strategy_id?: number | string | null;
  page?: number | string | null;
  page_size?: number | string | null;
  total?: number | string | null;
  has_next?: boolean | string | number | null;
  generated_at?: string | null;
  entries?: StrategyRiskLogEntryPayload[] | null;
}

export interface StrategyParameterUpdateResponse {
  parameters?: Record<string, unknown> | null;
  exit_config?: Array<Record<string, unknown>> | null;
}

export interface StrategyRuntimeParams {
  strategyId: number | string;
  refresh?: boolean;
}

export interface StrategySummaryUpdateParams {
  strategyId: number | string;
  primarySymbol?: string | null;
  dataSource?: string | null;
  triggerCount?: number | null;
  lastTriggeredAt?: string | null;
  strategyOrigin?: string | null;
  scheduleTimezone?: string | null;
}

export interface StrategyParameterUpdateParams {
  strategyId: number | string;
  parameters: Record<string, unknown>;
}

export interface StrategyRiskSettingsMutation {
  strategyId: string;
  maxPosition?: number | null;
  forbidPyramiding?: boolean | null;
  lossThreshold?: number | null;
  lossDurationMinutes?: number | null;
  notifyOnBreach?: boolean | null;
}

export interface StrategyRiskLogsParams {
  strategyId: number | string;
  page?: number;
  pageSize?: number;
  limit?: number;
}

export interface StrategyRiskLogsResult {
  strategyId: string;
  page: number;
  pageSize: number;
  total: number;
  hasNext: boolean;
  generatedAt: string | null;
  entries: StrategyRiskLogEntry[];
}

export interface StrategyStartParams {
  strategyId: number | string;
  ignoreSchedule?: boolean;
}

export interface StrategyStopParams {
  strategyId: number | string;
}

export interface StrategyDeleteParams {
  strategyId: number | string;
}

export class StrategyApiError extends Error {
  constructor(message: string, public readonly status?: number) {
    super(message);
    this.name = 'StrategyApiError';
  }
}

const requestJson = async <T>(
  path: string,
  token: string,
  init: RequestInit = {}
): Promise<T> => {
  const url = resolveRequestUrl(path);
  const headers: HeadersInit = {
    Accept: 'application/json',
    Authorization: `Bearer ${token}`,
    ...(init.headers ?? {})
  };
  if (init.body && !(headers as Record<string, string>)['Content-Type']) {
    (headers as Record<string, string>)['Content-Type'] = 'application/json';
  }

  const response = await fetch(url, { ...init, headers });

  if (response.status === 401) {
    throw new StrategyApiError('认证状态已失效，请重新登录', response.status);
  }
  if (!response.ok) {
    let detail = '调用策略服务失败';
    try {
      const payload = await response.json();
      if (payload && typeof payload === 'object' && typeof payload.detail === 'string') {
        detail = payload.detail;
      }
    } catch (_error) {
      void _error;
    }
    throw new StrategyApiError(detail, response.status);
  }

  const text = await response.text();
  if (!text) {
    return JSON.parse('{}') as T;
  }

  try {
    return JSON.parse(text) as T;
  } catch (_error) {
    throw new StrategyApiError('解析策略服务响应失败', response.status);
  }
};

const toStrategySchedule = (payload?: StrategyRecordPayload): StrategyScheduleConfig | null => {
  if (!payload) {
    return null;
  }
  const skipWeekends = payload.skip_weekends ?? true;
  const windowsPayload = Array.isArray(payload.windows) ? payload.windows : [];
  const windows: StrategyScheduleWindow[] = windowsPayload
    .map((entry) => {
      const startRaw = entry?.start ?? entry?.begin ?? entry?.from;
      const endRaw = entry?.end ?? entry?.finish ?? entry?.to;
      if (!startRaw || !endRaw) {
        return null;
      }
      const start = typeof startRaw === 'string' ? startRaw : String(startRaw);
      const end = typeof endRaw === 'string' ? endRaw : String(endRaw);
      return { start, end };
    })
    .filter((window): window is StrategyScheduleWindow => Boolean(window));

  const timezone = typeof payload.timezone === 'string' ? payload.timezone.trim() : null;
  const timezoneNotice =
    typeof payload.timezone_notice === 'string' ? payload.timezone_notice : null;

  return {
    skipWeekends,
    windows,
    timezone: timezone && timezone.length ? timezone : null,
    timezoneNotice
  };
};

const toParameterOptions = (value: unknown): StrategyParameterConfig['options'] => {
  if (!Array.isArray(value)) {
    return null;
  }
  return value
    .map((entry) => {
      if (entry && typeof entry === 'object') {
        const option = entry as Record<string, unknown>;
        const optionValue = option.value ?? option.key ?? option.id;
        const label = option.label ?? option.name ?? optionValue;
        if (optionValue === undefined || optionValue === null) {
          return null;
        }
        const normalizedValue =
          typeof optionValue === 'string' || typeof optionValue === 'number' || typeof optionValue === 'boolean'
            ? optionValue
            : String(optionValue);
        return {
          value: normalizedValue,
          label: typeof label === 'string' ? label : String(label)
        };
      }
      if (
        typeof entry === 'string' ||
        typeof entry === 'number' ||
        typeof entry === 'boolean'
      ) {
        return { value: entry, label: String(entry) };
      }
      return null;
    })
    .filter((option): option is { value: string | number | boolean; label: string } => Boolean(option));
};

const toNumber = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return null;
};

const toRecordOrNull = (value: unknown): Record<string, unknown> | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
};

const toBoolean = (value: unknown, fallback: boolean): boolean => {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (!normalized) {
      return fallback;
    }
    if (['true', '1', 'yes', 'on', 'enabled'].includes(normalized)) {
      return true;
    }
    if (['false', '0', 'no', 'off', 'disabled'].includes(normalized)) {
      return false;
    }
  }
  if (typeof value === 'number') {
    if (Number.isNaN(value)) {
      return fallback;
    }
    return value !== 0;
  }
  return fallback;
};

const toBooleanOrNull = (value: unknown): boolean | null => {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (!normalized) {
      return null;
    }
    if (['true', '1', 'yes', 'y', 'on', 'enabled', 'active'].includes(normalized)) {
      return true;
    }
    if (['false', '0', 'no', 'n', 'off', 'disabled', 'inactive'].includes(normalized)) {
      return false;
    }
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      return null;
    }
    if (value === 1) {
      return true;
    }
    if (value === 0) {
      return false;
    }
  }
  return null;
};

const resolveIsKlineStrategyFlag = (
  candidate: unknown,
  dataFeedMode: unknown
): boolean | null => {
  const explicit = toBooleanOrNull(candidate);
  if (explicit !== null) {
    return explicit;
  }
  if (typeof dataFeedMode === 'string') {
    const normalized = dataFeedMode.trim().toLowerCase();
    if (normalized) {
      const klineKeywords = ['kline', 'candle', 'candles', 'bar', 'bars', 'ohlc'];
      if (klineKeywords.some((keyword) => normalized.includes(keyword))) {
        return true;
      }
      const domKeywords = ['dom', 'depth', 'orderbook', 'order_book'];
      if (domKeywords.some((keyword) => normalized.includes(keyword))) {
        return false;
      }
    }
  }
  return null;
};

const toStringOrNull = (value: unknown): string | null => {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value.toString();
  }
  return null;
};

const toIdentifier = (...candidates: unknown[]): string | null => {
  for (const candidate of candidates) {
    if (typeof candidate === 'string') {
      const trimmed = candidate.trim();
      if (trimmed) {
        return trimmed;
      }
    }
    if (typeof candidate === 'number' && Number.isFinite(candidate)) {
      return String(candidate);
    }
  }
  return null;
};

const ensureStrategyId = (value: number | string): string => {
  return toIdentifier(value) ?? String(value);
};

const mapParameter = (payload: Record<string, unknown>): StrategyParameterConfig => {
  const nameRaw = payload.name ?? payload.key ?? payload.id ?? 'parameter';
  const name = typeof nameRaw === 'string' ? nameRaw : String(nameRaw);
  const labelRaw = payload.label ?? payload.title ?? name;
  const typeRaw = payload.type ?? payload.field_type ?? null;
  const descriptionRaw = payload.description ?? payload.help ?? null;
  const defaultRaw = payload.default ?? payload.default_value ?? payload.initial ?? null;
  const minRaw = payload.min ?? payload.min_value ?? null;
  const maxRaw = payload.max ?? payload.max_value ?? null;
  const stepRaw = payload.step ?? payload.step_value ?? null;

  return {
    name,
    label: typeof labelRaw === 'string' ? labelRaw : String(labelRaw ?? name),
    type: typeof typeRaw === 'string' ? typeRaw : null,
    value: payload.value ?? payload.current ?? null,
    defaultValue: defaultRaw ?? null,
    description: typeof descriptionRaw === 'string' ? descriptionRaw : null,
    options: toParameterOptions(payload.options ?? payload.choices),
    min: toNumber(minRaw),
    max: toNumber(maxRaw),
    step: toNumber(stepRaw)
  };
};

const extractSymbol = (payload: StrategyRecordPayload): string => {
  const symbolFields = [payload.symbol, payload.instrument];
  for (const raw of symbolFields) {
    if (typeof raw === 'string' && raw.trim()) {
      return raw;
    }
  }
  const parameters = Array.isArray(payload.parameters) ? payload.parameters : [];
  for (const entry of parameters) {
    if (!entry) {
      continue;
    }
    const candidateName = (entry.name ?? entry.key ?? entry.id ?? '') as string;
    if (!candidateName) {
      continue;
    }
    const normalizedName = candidateName.toLowerCase();
    if (['symbol', 'instrument', 'ticker'].includes(normalizedName)) {
      const value = entry.value ?? entry.default ?? entry.current;
      if (typeof value === 'string' && value.trim()) {
        return value;
      }
      if (Array.isArray(value)) {
        return value.filter((item) => typeof item === 'string').join(', ');
      }
    }
  }
  return '--';
};

const toStrategyMode = (payload: StrategyRecordPayload): StrategyItem['mode'] => {
  const modeCandidates = [payload.mode, payload.state, payload.strategy_type];
  for (const raw of modeCandidates) {
    if (typeof raw !== 'string') {
      continue;
    }
    const value = raw.toLowerCase();
    if (value.includes('live')) {
      return 'live';
    }
    if (value.includes('paper') || value.includes('sim')) {
      return 'paper';
    }
    if (value.includes('backtest') || value.includes('bt')) {
      return 'backtest';
    }
  }

  const parameters = Array.isArray(payload.parameters) ? payload.parameters : [];
  const modeParam = parameters.find((entry) => {
    const name = typeof entry?.name === 'string' ? entry.name.toLowerCase() : '';
    return ['mode', 'account_mode', 'run_mode'].includes(name);
  });
  if (modeParam) {
    const value = modeParam.value ?? modeParam.default ?? modeParam.current;
    if (typeof value === 'string') {
      const normalized = value.toLowerCase();
      if (normalized.includes('live')) {
        return 'live';
      }
      if (normalized.includes('paper') || normalized.includes('sim')) {
        return 'paper';
      }
      if (normalized.includes('backtest') || normalized.includes('bt')) {
        return 'backtest';
      }
    }
  }

  return 'paper';
};

const toStrategyStatus = (payload: StrategyRecordPayload): StrategyItem['status'] => {
  const stateRaw = payload.state ?? null;
  if (typeof stateRaw === 'string') {
    const normalized = stateRaw.toLowerCase();
    if (['error', 'failed', 'crashed'].includes(normalized)) {
      return 'error';
    }
    if (['running', 'active', 'live'].includes(normalized)) {
      return 'running';
    }
    if (['starting', 'initializing', 'initialising', 'pending'].includes(normalized)) {
      return 'starting';
    }
    if (['stopped', 'idle', 'disabled', 'inactive'].includes(normalized)) {
      return 'stopped';
    }
  }
  if (payload.active) {
    return 'running';
  }
  if (payload.enabled) {
    return 'starting';
  }
  return 'stopped';
};

const toReturnRate = (payload: StrategyRecordPayload): number => {
  const rawReturn =
    (payload as { return_rate?: unknown }).return_rate ??
    (payload as { returnRate?: unknown }).returnRate;
  const direct = toNumber(rawReturn);
  if (direct !== null) {
    return direct;
  }
  const metrics = payload.metrics;
  if (metrics && typeof metrics === 'object') {
    const metricReturn =
      toNumber(metrics.return_rate) ??
      toNumber(metrics.annualized_return) ??
      toNumber(metrics.pnl) ??
      null;
    if (metricReturn !== null) {
      return metricReturn;
    }
  }
  return 0;
};

const mapMetricsSnapshot = (
  payload: StrategyRecordPayload | StrategyMetricsResponse,
  fallbackPeriod?: string | null
): StrategyMetricsSnapshot | null => {
  const metrics = (payload as StrategyMetricsResponse).metrics ?? (payload as StrategyRecordPayload).metrics;
  if (!metrics || typeof metrics !== 'object') {
    return null;
  }
  
  // Check if this is a screener strategy (identified by 'screener_profile' in payload or keywords)
  // We should not map metrics for screener strategies as they don't have PnL/trades
  const record = payload as StrategyRecordPayload;
  if (record.screener_profile) {
    return null;
  }
  if (record.data_source && (record.data_source.includes('screener') || record.data_source.includes('screen'))) {
    return null;
  }
  if (record.template && (record.template.includes('screener') || record.template.includes('screen'))) {
    return null;
  }

  const normalized: Record<string, number | string> = {};
  for (const [key, value] of Object.entries(metrics)) {
    if (typeof value === 'number') {
      normalized[key] = value;
      continue;
    }
    if (typeof value === 'string') {
      const parsed = Number(value);
      normalized[key] = Number.isFinite(parsed) ? parsed : value;
      continue;
    }
    if (value === null || value === undefined) {
      continue;
    }
    normalized[key] = String(value);
  }
  const updatedAt =
    (payload as StrategyMetricsResponse).updated_at ??
    (payload as StrategyRecordPayload).metrics_updated_at ??
    null;
  const lastUpdatedAt =
    (payload as StrategyMetricsResponse).last_updated_at ??
    null;
  const period = (payload as StrategyMetricsResponse).period ?? fallbackPeriod ?? null;
  return {
    metrics: normalized,
    updatedAt: typeof updatedAt === 'string' ? normalizeTimestampToUtc(updatedAt) ?? null : null,
    lastUpdatedAt:
      typeof lastUpdatedAt === 'string'
        ? normalizeTimestampToUtc(lastUpdatedAt) ?? null
        : null,
    period
  };
};

const mapOrderItem = (payload: StrategyOrderPayload, index: number, strategyId: string): StrategyOrderItem => {
  const rawOrderId = payload.order_id ?? payload.id;
  const orderId =
    typeof rawOrderId === 'string'
      ? rawOrderId
      : typeof rawOrderId === 'number'
        ? String(rawOrderId)
        : null;
  const timestampRaw = payload.timestamp ?? payload.created_at ?? null;
  const quantity = toNumber(payload.quantity) ?? 0;
  const price = toNumber(payload.price ?? payload.last_price) ?? 0;
  const realizedPnlValue = toNumber(payload.realized_pnl);
  const pnl = toNumber(payload.pnl ?? realizedPnlValue ?? payload.unrealized_pnl);
  const symbol = typeof payload.symbol === 'string' ? payload.symbol : null;
  const filledQuantity =
    toNumber(
      payload.filled_quantity ??
        (typeof payload.filled === 'number' || typeof payload.filled === 'string' ? payload.filled : null) ??
        (typeof payload.executed_quantity === 'number' || typeof payload.executed_quantity === 'string'
          ? payload.executed_quantity
          : null) ??
        (typeof payload.executed_qty === 'number' || typeof payload.executed_qty === 'string'
          ? payload.executed_qty
          : null)
    ) ?? null;
  const averagePrice =
    toNumber(
      payload.avg_fill_price ??
        payload.fill_price ??
        (typeof payload.average_price === 'number' || typeof payload.average_price === 'string'
          ? payload.average_price
          : null) ??
        (typeof payload.avg_price === 'number' || typeof payload.avg_price === 'string' ? payload.avg_price : null)
    ) ?? null;
  const executedAtRaw = payload.executed_at ?? payload.completed_at ?? null;
  const executedAt =
    typeof executedAtRaw === 'string' ? normalizeTimestampToUtc(executedAtRaw) ?? null : null;
  const status = typeof payload.status === 'string' ? payload.status : null;
  const realizedPnl = realizedPnlValue ?? null;
  const commission =
    toNumber(
      payload.commission ??
        (typeof payload.fee === 'number' || typeof payload.fee === 'string' ? payload.fee : null) ??
        (typeof payload.fees === 'number' || typeof payload.fees === 'string' ? payload.fees : null)
    ) ?? null;
  const orderSource = typeof payload.order_source === 'string' ? payload.order_source : null;
  const rawNotes =
    typeof payload.notes === 'string'
      ? payload.notes
      : payload.notes === null || payload.notes === undefined
        ? null
        : String(payload.notes);
  const metadata: Record<string, unknown> | null = {};
  for (const [key, value] of Object.entries(payload)) {
    if (
      [
        'order_id',
        'id',
        'timestamp',
        'created_at',
        'quantity',
        'price',
        'side',
        'pnl',
        'strategy_id',
        'symbol',
        'filled_quantity',
        'filled',
        'executed_quantity',
        'executed_qty',
        'fill_price',
        'avg_fill_price',
        'average_price',
        'avg_price',
        'executed_at',
        'completed_at',
        'status',
        'realized_pnl',
        'commission',
        'fee',
        'fees',
        'order_source',
        'notes'
      ].includes(key)
    ) {
      continue;
    }
    metadata[key] = value;
  }
  return {
    id: orderId ?? `${strategyId}-${index}`,
    timestamp:
      typeof timestampRaw === 'string'
        ? normalizeTimestampToUtc(timestampRaw) ?? new Date().toISOString()
        : new Date().toISOString(),
    side: typeof payload.side === 'string' ? payload.side : 'UNKNOWN',
    quantity,
    price,
    pnl: pnl ?? null,
    symbol,
    filledQuantity,
    averagePrice,
    executedAt,
    status,
    realizedPnl,
    commission,
    orderSource,
    notes: rawNotes,
    metadata: Object.keys(metadata).length > 0 ? metadata : null
  };
};

const mapPerformanceSummary = (
  payload?: Record<string, unknown> | null
): Record<string, number | string | null> => {
  if (!payload || typeof payload !== 'object') {
    return {};
  }
  const summary: Record<string, number | string | null> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (typeof value === 'number') {
      summary[key] = value;
      continue;
    }
    if (typeof value === 'string') {
      const parsed = Number(value);
      summary[key] = Number.isFinite(parsed) ? parsed : value;
      continue;
    }
    if (value === null || value === undefined) {
      summary[key] = null;
      continue;
    }
    summary[key] = String(value);
  }
  return summary;
};

const mapPerformancePoint = (entry: unknown): StrategyPerformancePoint | null => {
  if (!entry || typeof entry !== 'object') {
    return null;
  }
  const payload = entry as Record<string, unknown>;
  const timestampRaw = payload.timestamp ?? payload.time ?? payload.t;
  const value = toNumber(payload.value ?? payload.y ?? payload.pnl ?? payload.amount);
  if (typeof timestampRaw !== 'string' || value === null) {
    return null;
  }
  const timestamp = normalizeTimestampToUtc(String(timestampRaw));
  if (!timestamp) {
    return null;
  }
  return { timestamp, value };
};

const mapDistributionPoint = (entry: unknown): StrategyDistributionPoint | null => {
  if (!entry || typeof entry !== 'object') {
    return null;
  }
  const payload = entry as Record<string, unknown>;
  const bucketRaw = payload.bucket ?? payload.label ?? payload.range;
  const value = toNumber(payload.value ?? payload.count ?? payload.total ?? 0) ?? 0;
  if (bucketRaw === undefined || bucketRaw === null) {
    return null;
  }
  return { bucket: String(bucketRaw), value };
};

const mapPerformanceCharts = (
  payload?: Record<string, unknown> | null
): StrategyPerformanceCharts | null => {
  if (!payload) {
    return null;
  }
  const cumulativeSource = Array.isArray(payload.cumulative_pnl)
    ? payload.cumulative_pnl
    : Array.isArray(payload.cumulativePnl)
      ? payload.cumulativePnl
      : [];
  const drawdownSource = Array.isArray(payload.drawdown) ? payload.drawdown : [];
  const distributionSource = Array.isArray(payload.distribution) ? payload.distribution : [];
  const winLossSource = Array.isArray(payload.win_loss)
    ? payload.win_loss
    : Array.isArray(payload.winLoss)
      ? payload.winLoss
      : [];

  const cumulative = cumulativeSource
    .map((item) => mapPerformancePoint(item))
    .filter((item): item is StrategyPerformancePoint => Boolean(item));
  const drawdown = drawdownSource
    .map((item) => mapPerformancePoint(item))
    .filter((item): item is StrategyPerformancePoint => Boolean(item));
  const distribution = distributionSource
    .map((item) => mapDistributionPoint(item))
    .filter((item): item is StrategyDistributionPoint => Boolean(item));
  const winLoss = winLossSource
    .map((item) => mapDistributionPoint(item))
    .filter((item): item is StrategyDistributionPoint => Boolean(item));

  return {
    cumulativePnl: cumulative,
    drawdown,
    distribution,
    winLoss
  };
};

const mapPnLCalendar = (payload?: Record<string, unknown> | null): StrategyPnLCalendar | null => {
  if (!payload) {
    return null;
  }
  const monthsRaw = Array.isArray(payload.months) ? payload.months : [];
  const months = monthsRaw
    .map((monthEntry) => {
      if (!monthEntry || typeof monthEntry !== 'object') {
        return null;
      }
      const monthPayload = monthEntry as Record<string, unknown>;
      const monthLabelRaw = monthPayload.month ?? monthPayload.label ?? null;
      const daysRaw = Array.isArray(monthPayload.days) ? monthPayload.days : [];
      const days = daysRaw
        .map((dayEntry) => {
          if (!dayEntry || typeof dayEntry !== 'object') {
            return null;
          }
          const dayPayload = dayEntry as Record<string, unknown>;
          const dateRaw = dayPayload.date ?? dayPayload.day ?? null;
          const pnl = toNumber(dayPayload.pnl ?? dayPayload.value ?? dayPayload.total);
          if (typeof dateRaw !== 'string' || pnl === null) {
            return null;
          }
          return { date: dateRaw, pnl };
        })
        .filter((day): day is { date: string; pnl: number } => Boolean(day));
      if (typeof monthLabelRaw !== 'string') {
        return null;
      }
      return { month: monthLabelRaw, days };
    })
    .filter((month): month is { month: string; days: { date: string; pnl: number }[] } => Boolean(month));

  return {
    months,
    start: typeof payload.start === 'string' ? payload.start : null,
    end: typeof payload.end === 'string' ? payload.end : null
  };
};

const mapCandlesSnapshot = (payload: StrategyCandlesResponse): StrategyCandlesSnapshot => {
  const candlesContainer =
    payload.candles && typeof payload.candles === 'object' && !Array.isArray(payload.candles)
      ? (payload.candles as StrategyCandlesPayloadGroup)
      : null;

  const intervalRaw =
    typeof candlesContainer?.interval === 'string'
      ? candlesContainer.interval
      : typeof payload.interval === 'string'
        ? payload.interval
        : null;
  const interval = intervalRaw ?? '5m';

  const candlesSource = Array.isArray(candlesContainer?.candles)
    ? candlesContainer.candles ?? []
    : Array.isArray(payload.candles)
      ? payload.candles
      : [];
  const candles: StrategyCandlesSnapshot['candles'] = [];
  for (const entry of candlesSource) {
    if (!entry || typeof entry !== 'object') {
      continue;
    }
    const candle = entry as Record<string, unknown>;
    const timestampRaw = typeof candle.timestamp === 'string' ? candle.timestamp : null;
    const timestamp = timestampRaw ? normalizeTimestampToUtc(timestampRaw) : null;
    const open = toNumber(candle.open);
    const high = toNumber(candle.high);
    const low = toNumber(candle.low);
    const close = toNumber(candle.close);
    const volume = toNumber(candle.volume);
    if (!timestamp || open === null || high === null || low === null || close === null || volume === null) {
      continue;
    }
    candles.push({ timestamp, open, high, low, close, volume });
  }

  const signals: StrategyCandlesSnapshot['signals'] = [];
  const signalsSource = Array.isArray(candlesContainer?.signals)
    ? candlesContainer.signals ?? []
    : Array.isArray(payload.signals)
      ? payload.signals
      : [];
  for (const entry of signalsSource) {
    if (!entry || typeof entry !== 'object') {
      continue;
    }
    const signal = entry as Record<string, unknown>;
    const timestampRaw = typeof signal.timestamp === 'string' ? signal.timestamp : null;
    const timestamp = timestampRaw ? normalizeTimestampToUtc(timestampRaw) : null;
    const price = toNumber(signal.price ?? signal.value ?? signal.level);
    const sideRaw = signal.side ?? signal.type ?? null;
    const pnl = toNumber(signal.pnl ?? signal.delta ?? null);
    if (!timestamp || price === null) {
      continue;
    }
    const formatted: StrategyCandleSignal = {
      timestamp,
      price,
      side: typeof sideRaw === 'string' ? sideRaw : 'UNKNOWN'
    };
    if (pnl !== null) {
      formatted.pnl = pnl;
    }
    signals.push(formatted);
  }

  const symbol = typeof payload.symbol === 'string' ? payload.symbol : null;
  const intervalSeconds = toNumber(candlesContainer?.interval_seconds ?? payload.interval_seconds);
  const durationSeconds = toNumber(candlesContainer?.duration_seconds ?? payload.duration_seconds);
  const refreshedAtSource = candlesContainer?.refreshed_at ?? payload.refreshed_at;
  const refreshedAtRaw = typeof refreshedAtSource === 'string' ? refreshedAtSource : null;
  const refreshedAt = refreshedAtRaw ? normalizeTimestampToUtc(refreshedAtRaw) : null;

  return {
    symbol,
    interval,
    intervalSeconds: intervalSeconds ?? null,
    durationSeconds: durationSeconds ?? null,
    refreshedAt,
    candles,
    signals
  };
};

const mapScheduleFromConfig = (
  payload?: StrategyConfigResponsePayload | null
): StrategyScheduleConfig | null => {
  if (!payload?.schedule) {
    return null;
  }
  const schedulePayload = payload.schedule;
  const skipWeekends =
    typeof schedulePayload.skip_weekends === 'boolean'
      ? schedulePayload.skip_weekends
      : schedulePayload.skip_weekends == null
        ? true
        : Boolean(schedulePayload.skip_weekends);
  const windowsPayload = Array.isArray(schedulePayload.windows)
    ? schedulePayload.windows
    : [];
  const timezoneRaw =
    (schedulePayload as Record<string, unknown>).timezone ??
    (schedulePayload as Record<string, unknown>).time_zone;
  const timezoneNoticeRaw = (schedulePayload as Record<string, unknown>).timezone_notice;
  let timezone: string | null = null;
  let timezoneNotice: string | null = null;
  if (typeof timezoneRaw === 'string') {
    const candidate = timezoneRaw.trim();
    if (candidate) {
      timezone = candidate;
    }
  }
  if (typeof timezoneNoticeRaw === 'string' && timezoneNoticeRaw.trim()) {
    timezoneNotice = timezoneNoticeRaw.trim();
  }
  const windows: StrategyScheduleWindow[] = windowsPayload
    .map((entry) => {
      if (!entry) {
        return null;
      }
      const startRaw = (entry.start ?? entry.begin ?? entry.from) as string | undefined;
      const endRaw = (entry.end ?? entry.finish ?? entry.to) as string | undefined;
      if (!startRaw || !endRaw) {
        return null;
      }
      return { start: String(startRaw), end: String(endRaw) };
    })
    .filter((window): window is StrategyScheduleWindow => Boolean(window));
  return {
    skipWeekends,
    windows,
    timezone,
    timezoneNotice
  };
};

const mapParameterDefinitionsFromConfig = (
  payload: StrategyConfigResponsePayload
): StrategyParameterConfig[] | null => {
  const entries = Array.isArray(payload.parameter_definitions)
    ? payload.parameter_definitions
    : null;
  if (!entries?.length) {
    return null;
  }
  const parameters = entries
    .map((entry) => {
      if (!entry) {
        return null;
      }
      return mapParameter(entry as Record<string, unknown>);
    })
    .filter((value): value is StrategyParameterConfig => Boolean(value));
  return parameters.length ? parameters : null;
};

const mapStrategyDetailSummary = (
  payload: StrategyConfigResponsePayload
): StrategyDetailSummary => {
  const primarySymbol =
    typeof payload.primary_symbol === 'string' && payload.primary_symbol.trim()
      ? payload.primary_symbol.trim()
      : null;
  let secondarySymbol =
    typeof payload.secondary_symbol === 'string' && payload.secondary_symbol.trim()
      ? payload.secondary_symbol.trim()
      : null;
  if (!secondarySymbol && payload.parameters && typeof payload.parameters === 'object') {
    const params = payload.parameters as Record<string, unknown>;
    const rawSecondary =
      typeof params.secondary_symbol === 'string'
        ? params.secondary_symbol
        : typeof params.symbol2 === 'string'
          ? params.symbol2
          : null;
    if (rawSecondary && rawSecondary.trim()) {
      secondarySymbol = rawSecondary.trim();
    }
  }
  const dataSource =
    typeof payload.data_source === 'string' && payload.data_source.trim()
      ? payload.data_source.trim()
      : null;
  const strategyOrigin =
    typeof payload.strategy_origin === 'string' && payload.strategy_origin.trim()
      ? payload.strategy_origin.trim()
      : null;
  const filePath =
    typeof payload.file_path === 'string' && payload.file_path.trim()
      ? payload.file_path.trim()
      : null;
  const triggerCount = toNumber(payload.trigger_count);
  const childParameters = toRecordOrNull(payload.child_parameters);
  const childStrategyType =
    typeof payload.child_strategy_type === 'string' && payload.child_strategy_type.trim()
      ? payload.child_strategy_type.trim()
      : null;
  const maxChildren = toNumber(payload.max_children);
  const selectionLimit = toNumber(payload.selection_limit);
  const recordId =
    toIdentifier(payload.id, payload.strategy_id, payload.name) ?? 'unknown-strategy';
  const isKlineStrategyFlag = resolveIsKlineStrategyFlag(
    payload.is_kline_strategy,
    payload.data_feed_mode
  );
  const summary: StrategyDetailSummary = {
    id: recordId,
    name:
      typeof payload.title === 'string' && payload.title.trim() ? payload.title.trim() : recordId,
    description: typeof payload.description === 'string' ? payload.description : null,
    strategyType: typeof payload.strategy_type === 'string' ? payload.strategy_type : null,
    primarySymbol,
    secondarySymbol,
    dataSource,
    strategyOrigin,
    filePath,
    childStrategyType,
    childParameters,
    maxChildren,
    selectionLimit,
    triggerCount,
    lastTriggeredAt: typeof payload.last_triggered_at === 'string' ? payload.last_triggered_at : null,
    schedule: mapScheduleFromConfig(payload),
    createdAt: typeof payload.created_at === 'string' ? payload.created_at : null,
    updatedAt: typeof payload.updated_at === 'string' ? payload.updated_at : null,
    parameters: payload.parameters ?? null,
    parameterDefinitions: mapParameterDefinitionsFromConfig(payload),
    exit_config: null,
    screenerProfile: toRecordOrNull(payload.screener_profile),
    screenerSchedule: toRecordOrNull(payload.screener_schedule)
  };
  if (Array.isArray(payload.exit_config) && payload.exit_config.length > 0) {
    summary.exit_config = payload.exit_config;
  }
  if (!summary.exit_config && payload.parameters && typeof payload.parameters === 'object') {
    const rawExit = (payload.parameters as Record<string, unknown>).exit_config;
    if (rawExit && typeof rawExit === 'object' && !Array.isArray(rawExit)) {
      const record = rawExit as Record<string, unknown>;
      const makeDef = (name: string, type: string, label?: string) => ({
        name,
        label: typeof label === 'string' && label.trim() ? label : name,
        type,
        value: record[name]
      });
      const defs: Array<Record<string, unknown>> = [];
      if (record.mode !== undefined) defs.push(makeDef('mode', 'select', '退出方式'));
      if (record.risk_amount !== undefined) defs.push(makeDef('risk_amount', 'float', '风险金额'));
      if (record.rr_ratio !== undefined) defs.push(makeDef('rr_ratio', 'float', 'RR 比例'));
      if (record.atr_length !== undefined) defs.push(makeDef('atr_length', 'int', 'ATR 长度'));
      if (record.atr_multiplier !== undefined) defs.push(makeDef('atr_multiplier', 'float', 'ATR 倍数'));
      if (record.trailing_multiplier !== undefined)
        defs.push(makeDef('trailing_multiplier', 'float', '跟踪 ATR 倍数'));
      summary.exit_config = defs.length ? defs : null;
    }
    if (!summary.exit_config) {
      const p = payload.parameters as Record<string, unknown>;
      const defs: Array<Record<string, unknown>> = [];
      const makeDef = (name: string, type: string, label?: string) => ({
        name,
        label: typeof label === 'string' && label.trim() ? label : name,
        type,
        value: p[name]
      });
      if (p.mode !== undefined || p.exit_mode !== undefined || p.exit_type !== undefined || p.exit_strategy !== undefined || p.strategy_exit !== undefined || p.exit_method !== undefined) {
        const modeValue = p.mode ?? p.exit_mode ?? p.exit_type ?? p.exit_strategy ?? p.strategy_exit ?? p.exit_method;
        defs.push({ name: 'mode', label: '退出方式', type: 'select', value: modeValue });
      }
      if (p.risk_amount !== undefined) defs.push(makeDef('risk_amount', 'float', '风险金额'));
      if (p.rr_ratio !== undefined) defs.push(makeDef('rr_ratio', 'float', 'RR 比例'));
      if (p.atr_length !== undefined) defs.push(makeDef('atr_length', 'int', 'ATR 长度'));
      if (p.atr_multiplier !== undefined) defs.push(makeDef('atr_multiplier', 'float', 'ATR 倍数'));
      if (p.trailing_multiplier !== undefined) defs.push(makeDef('trailing_multiplier', 'float', '跟踪 ATR 倍数'));
      summary.exit_config = defs.length ? defs : null;
    }
  }
  if (isKlineStrategyFlag !== null) {
    summary.isKlineStrategy = isKlineStrategyFlag;
  }
  return summary;
};

const mapRuntimeSummary = (
  payload: Record<string, unknown> | null | undefined
): StrategyRuntimeSnapshotData['summary'] => {
  if (!payload) {
    return {};
  }
  const summary: StrategyRuntimeSnapshotData['summary'] = {};
  for (const [key, value] of Object.entries(payload)) {
    switch (key) {
      case 'is_receiving_data':
      case 'awaiting_data': {
        summary[key] = toBooleanOrNull(value);
        break;
      }
      case 'runtime_seconds':
      case 'processed_count':
      case 'threshold_hits':
      case 'buy_signals':
      case 'sell_signals': {
        const parsed = toNumber(value);
        summary[key] = parsed !== null ? parsed : null;
        break;
      }
      case 'data_label':
      case 'data_label_display': {
        summary[key] = toStringOrNull(value);
        break;
      }
      default: {
        if (value === null || value === undefined) {
          summary[key] = null;
        } else if (typeof value === 'boolean' || typeof value === 'number' || typeof value === 'string') {
          summary[key] = value;
        } else {
          summary[key] = String(value);
        }
      }
    }
  }
  return summary;
};

const mapRuntimeDataPush = (payload: unknown): StrategyRuntimeSnapshotData['data_push'] => {
  if (!payload || typeof payload !== 'object') {
    return null;
  }
  const record = payload as Record<string, unknown>;
  const dataPush: StrategyRuntimeSnapshotData['data_push'] = {};
  for (const [key, value] of Object.entries(record)) {
    switch (key) {
      case 'symbol':
      case 'subscription':
      case 'status_reason': {
        dataPush[key] = toStringOrNull(value);
        break;
      }
      case 'data_label':
      case 'data_label_display': {
        dataPush[key] = toStringOrNull(value);
        break;
      }
      case 'last_data_timestamp': {
        const timestamp = toStringOrNull(value);
        dataPush.last_data_timestamp = timestamp ?? (value == null ? null : String(value));
        break;
      }
      case 'is_receiving_data': {
        dataPush.is_receiving_data = toBooleanOrNull(value);
        break;
      }
      default: {
        dataPush[key] = value;
      }
    }
  }
  return Object.keys(dataPush).length ? dataPush : null;
};

const mapRuntimeStopLevels = (payload: unknown): StrategyRuntimeSnapshotData['stop_levels'] => {
  if (!payload || typeof payload !== 'object') {
    return null;
  }
  const record = payload as Record<string, unknown>;
  const stopLevels: StrategyRuntimeSnapshotData['stop_levels'] = {};
  for (const [key, value] of Object.entries(record)) {
    switch (key) {
      case 'stop_loss_enabled':
      case 'take_profit_enabled': {
        stopLevels[key] = toBooleanOrNull(value);
        break;
      }
      case 'stop_loss_price':
      case 'take_profit_price': {
        const parsed = toNumber(value);
        stopLevels[key] = parsed !== null ? parsed : null;
        break;
      }
      default: {
        stopLevels[key] = value;
      }
    }
  }
  return Object.keys(stopLevels).length ? stopLevels : null;
};

const mapRuntimeLogs = (payload: unknown): StrategyRuntimeSnapshotData['logs'] => {
  if (!Array.isArray(payload)) {
    return null;
  }
  const entries = payload
    .map((item, index) => {
      if (!item || typeof item !== 'object') {
        return null;
      }
      const record = item as Record<string, unknown>;
      const id = toStringOrNull(record.id) ?? `log-${index}`;
      const level = toStringOrNull(record.level);
      const tone = toStringOrNull(record.tone);
      const timestamp = toStringOrNull(record.timestamp);
      const message = toStringOrNull(record.message);
      const entry = {
        id,
        level,
        tone,
        timestamp,
        message,
        details: record.details
      };
      return entry;
    })
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));
  return entries.length ? entries : null;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

export const mapRuntimeSnapshot = (
  payload: Record<string, unknown> | null | undefined
): StrategyRuntimeSnapshotData => {
  const runtimeNested = isRecord(payload?.runtime)
    ? (payload?.runtime as Record<string, unknown>)
    : null;
  const runtimeSnapshotNested = isRecord(payload?.runtime_snapshot)
    ? (payload?.runtime_snapshot as Record<string, unknown>)
    : isRecord(payload?.runtimeSnapshot)
      ? (payload?.runtimeSnapshot as Record<string, unknown>)
      : null;
  const basePayload = runtimeSnapshotNested ?? runtimeNested ?? null;
  const payloadBase = payload ? { ...payload } : null;
  if (payloadBase) {
    delete payloadBase.runtime;
    delete payloadBase.runtime_snapshot;
    delete payloadBase.runtimeSnapshot;
  }
  const mergedPayload: Record<string, unknown> | null =
    basePayload && payloadBase
      ? { ...basePayload, ...payloadBase }
      : payloadBase
        ? payloadBase
        : basePayload
          ? { ...basePayload }
          : null;

  const summaryPayload = (mergedPayload?.summary ?? null) as Record<string, unknown> | null;
  const snapshot: StrategyRuntimeSnapshotData = {
    summary: mapRuntimeSummary(summaryPayload),
    refreshedAt:
      typeof mergedPayload?.refreshed_at === 'string'
        ? (mergedPayload?.refreshed_at as string)
        : typeof mergedPayload?.updated_at === 'string'
          ? (mergedPayload?.updated_at as string)
          : null
  };

  if (mergedPayload) {
    if ('data_push' in mergedPayload) {
      snapshot.data_push = mapRuntimeDataPush(mergedPayload.data_push);
    }
    if ('stop_levels' in mergedPayload) {
      snapshot.stop_levels = mapRuntimeStopLevels(mergedPayload.stop_levels);
    }
    if ('logs' in mergedPayload) {
      snapshot.logs = mapRuntimeLogs(mergedPayload.logs);
    }
    for (const [key, value] of Object.entries(mergedPayload)) {
      if (
        key === 'summary' ||
        key === 'refreshed_at' ||
        key === 'updated_at' ||
        key === 'data_push' ||
        key === 'stop_levels' ||
        key === 'logs'
      ) {
        continue;
      }
      snapshot[key] = value;
    }
  }
  return snapshot;
};

const mapRunnerStatus = (value: unknown): StrategyRunnerStatus | null => {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const record = value as Record<string, unknown>;
  const ready = toBoolean(record.ready, false);
  const reasonRaw = record.reason;
  let reason: string | null = null;
  if (typeof reasonRaw === 'string') {
    const trimmed = reasonRaw.trim();
    reason = trimmed ? trimmed : null;
  }
  return { ready, reason };
};

const mapRuntimeDetailFromPayload = (
  strategyId: string,
  payload?: StrategyRuntimePayload | StrategyRuntimeResponsePayload | null
): StrategyRuntimeDetail => {
  const statusPayload = payload?.status ?? {};
  const triggerCount = toNumber(payload?.trigger_count);
  const snapshotBase = (payload?.snapshot ?? null) as Record<string, unknown> | null;
  const runtimeSnapshotExtra = isRecord(payload?.runtime_snapshot)
    ? (payload?.runtime_snapshot as Record<string, unknown>)
    : isRecord(payload?.runtimeSnapshot)
      ? (payload?.runtimeSnapshot as Record<string, unknown>)
      : null;
  const snapshotPayload =
    runtimeSnapshotExtra
      ? { ...(snapshotBase ?? {}), runtime_snapshot: runtimeSnapshotExtra }
      : snapshotBase;
  const canonicalId = toIdentifier(payload?.id, strategyId, payload?.strategy_id) ?? strategyId;
  const runnerStatusPayload =
    typeof payload === 'object' && payload !== null
      ? (payload as Record<string, unknown>).runner_status
      : null;
  try {
    console.debug('[RuntimeAPI][raw]', {
      strategyId: canonicalId,
      last_triggered_at: typeof payload?.last_triggered_at === 'string' ? payload.last_triggered_at : null,
      snapshot_refreshed_at:
        snapshotPayload && typeof snapshotPayload.refreshed_at === 'string' ? snapshotPayload.refreshed_at : null,
      snapshot_updated_at:
        snapshotPayload && typeof snapshotPayload.updated_at === 'string' ? snapshotPayload.updated_at : null
    });
  } catch (e) {
    void e;
  }
  return {
    strategyId: canonicalId,
    status: {
      active: toBoolean(statusPayload?.active, false),
      enabled: toBoolean(statusPayload?.enabled, false)
    },
    snapshot: mapRuntimeSnapshot(snapshotPayload),
    runnerStatus: mapRunnerStatus(runnerStatusPayload),
    triggerCount,
    lastTriggeredAt: typeof payload?.last_triggered_at === 'string' ? payload.last_triggered_at : null
  };
};

const mapRiskSettingsRecord = (
  strategyId: string,
  payload?: StrategyRiskSettingsPayload | null
): StrategyRiskSettings => {
  const recordId = toNumber(payload?.id);
  const strategyRecordId = toIdentifier(payload?.strategy_id);
  const canonicalId = toIdentifier(strategyId) ?? 'unknown-strategy';
  return {
    id: recordId,
    strategyRecordId,
    strategyId: canonicalId,
    maxPosition: toNumber(payload?.max_position),
    forbidPyramiding: toBoolean(payload?.forbid_pyramiding, false),
    lossThreshold: toNumber(payload?.loss_threshold),
    lossDurationMinutes: toNumber(payload?.loss_duration_minutes),
    notifyOnBreach: toBoolean(payload?.notify_on_breach, true),
    createdAt: typeof payload?.created_at === 'string' ? payload.created_at : null,
    updatedAt: typeof payload?.updated_at === 'string' ? payload.updated_at : null
  };
};

const toRiskCheckStatus = (value: unknown): StrategyRiskLogCheck['status'] => {
  const normalized = toStringOrNull(value)?.trim().toLowerCase();
  switch (normalized) {
    case 'pass':
    case 'passed':
    case 'ok':
    case 'okay':
    case 'success':
    case 'satisfied':
    case 'within_limit':
    case 'within':
    case 'in_range':
      return 'pass';
    case 'fail':
    case 'failed':
    case 'breach':
    case 'breached':
    case 'error':
    case 'violation':
    case 'out_of_range':
    case 'critical':
    case 'fatal':
      return 'fail';
    case 'warn':
    case 'warning':
    case 'alert':
    case 'caution':
    case 'degraded':
      return 'warning';
    case 'info':
    case 'informational':
    case 'pending':
    case 'skipped':
      return 'info';
    case 'unknown':
    case 'n/a':
      return 'unknown';
    default:
      return 'unknown';
  }
};

const formatRiskCheckValue = (value: unknown): string | null => {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      return null;
    }
    return value.toLocaleString(undefined, { maximumFractionDigits: 6 });
  }
  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }
  if (Array.isArray(value)) {
    if (!value.length) {
      return null;
    }
    const tokens = value
      .map((entry) => formatRiskCheckValue(entry) ?? '')
      .filter((entry) => Boolean(entry));
    return tokens.length ? tokens.join(', ') : null;
  }
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return (
      formatRiskCheckValue(record.formatted) ??
      formatRiskCheckValue(record.display) ??
      formatRiskCheckValue(record.label) ??
      formatRiskCheckValue(record.text) ??
      formatRiskCheckValue(record.value_text) ??
      formatRiskCheckValue(record.value) ??
      (() => {
        try {
          return JSON.stringify(value);
        } catch (error) {
          console.warn('无法序列化风险检查值：', value, error);
          return String(value);
        }
      })()
    );
  }
  try {
    return JSON.stringify(value);
  } catch (error) {
    console.warn('无法序列化风险检查原始值：', value, error);
    return String(value);
  }
};

const formatRiskCheckSourceLabel = (value: string | null | undefined): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  return trimmed
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\b([a-z])/g, (match) => match.toUpperCase());
};

const parseRiskCheckItem = (
  value: unknown,
  index: number,
  source?: string | null
): StrategyRiskLogCheck | null => {
  const record = toRecordOrNull(value);
  if (!record) {
    const label = toStringOrNull(value);
    if (!label) {
      return null;
    }
    const decoratedLabel = (() => {
      const formattedSource = formatRiskCheckSourceLabel(source ?? null);
      if (!formattedSource) {
        return label;
      }
      return `${formattedSource}: ${label}`;
    })();
    return {
      id: `risk-check-${index}`,
      label: decoratedLabel,
      status: 'info',
      reason: null,
      currentValue: null,
      threshold: null
    };
  }

  const id =
    toStringOrNull(
      record.id ??
        record.identifier ??
        record.key ??
        record.name ??
        record.check ??
        record.type ??
        record.code
    ) ?? `risk-check-${index}`;
  const formattedSource = formatRiskCheckSourceLabel(source ?? null);
  const rawLabel =
    toStringOrNull(
      record.label ??
        record.title ??
        record.name ??
        record.check ??
        record.id ??
        record.code
    ) ??
    `检查 ${index + 1}`;
  const label = formattedSource ? `${formattedSource}: ${rawLabel}` : rawLabel;
  const statusFromPassed = (() => {
    if (!('passed' in record)) {
      return null;
    }
    const passed = record.passed as unknown;
    if (typeof passed === 'boolean') {
      return passed ? 'pass' : 'fail';
    }
    if (typeof passed === 'number') {
      if (!Number.isFinite(passed)) {
        return null;
      }
      if (passed > 0) {
        return 'pass';
      }
      if (passed === 0) {
        return 'fail';
      }
      return 'fail';
    }
    const normalized = toStringOrNull(passed)?.trim().toLowerCase();
    if (!normalized) {
      return null;
    }
    if (['true', '1', 'yes', 'y'].includes(normalized)) {
      return 'pass';
    }
    if (['false', '0', 'no', 'n'].includes(normalized)) {
      return 'fail';
    }
    const normalizedStatus = toRiskCheckStatus(normalized);
    return normalizedStatus === 'unknown' ? null : normalizedStatus;
  })();

  const status =
    statusFromPassed ??
    toRiskCheckStatus(record.status ?? record.result ?? record.outcome ?? record.state ?? record.level);
  const reason =
    toStringOrNull(
      record.reason ?? record.message ?? record.detail ?? record.description ?? record.summary
    ) ?? null;
  const currentValue =
    formatRiskCheckValue(
      record.current_value ??
        record.currentValue ??
        record.current ??
        record.value ??
        record.actual ??
        record.observed ??
        record.measured
    ) ?? null;
  const threshold =
    formatRiskCheckValue(
      record.threshold ??
        record.limit ??
        record.maximum ??
        record.minimum ??
        record.expected ??
        record.target ??
        record.cap ??
        record.floor
    ) ?? null;

  return {
    id,
    label,
    status,
    reason,
    currentValue,
    threshold
  };
};

const normalizeRiskChecks = (
  value: unknown
): { summary: string | null; checks: StrategyRiskLogCheck[] } | null => {
  const record = toRecordOrNull(value);
  const candidateArrayKeys = ['evaluations', 'checks', 'items', 'entries', 'results'] as const;
  const summaryKeys = new Set([
    'summary',
    'message',
    'detail',
    'description',
    'headline',
    'overview',
    'summary_message',
    'text'
  ]);
  const ignoredKeys = new Set(['extra']);
  let summary: string | null = null;
  const collected: Array<{ value: unknown; source?: string | null }> = [];

  const appendEntries = (entries: unknown[], source?: string | null) => {
    for (const entry of entries) {
      collected.push({ value: entry, source: source ?? null });
    }
  };

  const extractEntriesFromRecord = (input: Record<string, unknown>, source?: string | null) => {
    for (const key of candidateArrayKeys) {
      const candidate = input[key];
      if (Array.isArray(candidate)) {
        appendEntries(candidate, source);
        continue;
      }
      if (candidate && typeof candidate === 'object') {
        const nestedValues = Object.values(candidate as Record<string, unknown>);
        for (const nested of nestedValues) {
          if (Array.isArray(nested)) {
            appendEntries(nested, source);
          }
        }
      }
    }
  };

  if (record) {
    summary =
      toStringOrNull(
        record.summary ?? record.message ?? record.detail ?? record.description ?? record.headline
      ) ?? null;

    extractEntriesFromRecord(record);

    for (const [key, raw] of Object.entries(record)) {
      if (
        summaryKeys.has(key) ||
        ignoredKeys.has(key) ||
        candidateArrayKeys.includes(key as (typeof candidateArrayKeys)[number])
      ) {
        continue;
      }
      if (raw == null) {
        continue;
      }

      if (Array.isArray(raw)) {
        appendEntries(raw, key);
        continue;
      }

      const childRecord = toRecordOrNull(raw);
      if (!childRecord) {
        continue;
      }

      const sourceLabel =
        toStringOrNull(
          childRecord.source ??
            childRecord.name ??
            childRecord.title ??
            childRecord.label ??
            childRecord.summary ??
            childRecord.description ??
            childRecord.message
        ) ?? key;

      extractEntriesFromRecord(childRecord, sourceLabel);
    }

    if (!summary) {
      summary = toStringOrNull(record.overview ?? record.summary_message ?? record.text) ?? null;
    }
  } else if (Array.isArray(value)) {
    appendEntries(value);
  } else if (typeof value === 'string') {
    summary = value;
  }

  if (!collected.length && !summary) {
    return null;
  }

  const checks = collected
    .map(({ value: entry, source }, index) => parseRiskCheckItem(entry, index, source))
    .filter((entry): entry is StrategyRiskLogCheck => Boolean(entry));

  return {
    summary,
    checks
  };
};

const findRiskChecksInPayload = (
  value: unknown
): { riskChecks: unknown | null; sanitized: unknown; found: boolean } => {
  if (Array.isArray(value)) {
    let extracted: unknown | null = null;
    let found = false;
    const sanitizedItems = value
      .map((entry) => {
        const result = findRiskChecksInPayload(entry);
        if (result.found && !found) {
          extracted = result.riskChecks;
          found = true;
        }
        return result.sanitized;
      })
      .filter((entry) => entry !== undefined && entry !== null);

    return {
      riskChecks: extracted,
      sanitized: sanitizedItems.length ? sanitizedItems : null,
      found
    };
  }

  const record = toRecordOrNull(value);
  if (!record) {
    return {
      riskChecks: null,
      sanitized: value,
      found: false
    };
  }

  const next: Record<string, unknown> = {};
  let extracted: unknown | null = null;
  let found = false;

  if ('risk_checks' in record || 'riskChecks' in record) {
    extracted = record.risk_checks ?? record.riskChecks;
    found = extracted !== undefined && extracted !== null;
  }

  for (const [key, val] of Object.entries(record)) {
    if (key === 'risk_checks' || key === 'riskChecks') {
      continue;
    }
    if (key === 'extra') {
      const extraResult = findRiskChecksInPayload(val);
      if (extraResult.found && !found) {
        extracted = extraResult.riskChecks;
        found = true;
      }
      if (extraResult.sanitized !== undefined && extraResult.sanitized !== null) {
        next[key] = extraResult.sanitized as unknown;
      }
      continue;
    }
    if (val !== undefined && val !== null) {
      next[key] = val;
    }
  }

  const sanitizedEntries = Object.entries(next);
  const sanitized = sanitizedEntries.length
    ? sanitizedEntries.reduce<Record<string, unknown>>((acc, [key, val]) => {
        acc[key] = val;
        return acc;
      }, {})
    : null;

  return {
    riskChecks: extracted,
    sanitized,
    found
  };
};

const SKIPPED_RISK_CONTEXT_KEYS = new Set(['event', 'payload', 'extra']);

const isMeaningfulRiskContextValue = (
  value: unknown,
  seen: WeakSet<object> = new WeakSet()
): boolean => {
  if (value === null || value === undefined) {
    return false;
  }
  if (typeof value === 'string') {
    return value.trim().length > 0;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return true;
  }
  if (Array.isArray(value)) {
    return value.some((entry) => isMeaningfulRiskContextValue(entry, seen));
  }
  if (value instanceof Date) {
    return !Number.isNaN(value.getTime());
  }
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    if (seen.has(record)) {
      return false;
    }
    seen.add(record);
    return Object.values(record).some((entry) => isMeaningfulRiskContextValue(entry, seen));
  }
  return true;
};

const addRiskContextEntry = (
  entries: Array<[string, unknown]>,
  key: string,
  value: unknown,
  summary: string | null,
  message: string | null
) => {
  if (SKIPPED_RISK_CONTEXT_KEYS.has(key)) {
    return;
  }
  if (
    typeof value === 'string' &&
    (value === summary || value === message) &&
    (key === 'summary' || key === 'message' || key === 'detail' || key === 'description')
  ) {
    return;
  }
  if (!isMeaningfulRiskContextValue(value)) {
    return;
  }
  entries.push([key, value]);
};

const sanitizeRiskContext = (
  context: Record<string, unknown> | null,
  summary: string | null,
  message: string | null,
  options: {
    removeRootRiskChecks?: boolean;
    payloadReplacement?: unknown;
  }
): Record<string, unknown> | null => {
  if (!context) {
    return null;
  }
  const entries: Array<[string, unknown]> = [];
  for (const [key, value] of Object.entries(context)) {
    if (options.removeRootRiskChecks && (key === 'risk_checks' || key === 'riskChecks')) {
      continue;
    }
    if (key === 'payload' && 'payloadReplacement' in options) {
      const replacement = options.payloadReplacement;
      if (replacement && typeof replacement === 'object' && !Array.isArray(replacement)) {
        for (const [childKey, childValue] of Object.entries(
          replacement as Record<string, unknown>
        )) {
          addRiskContextEntry(entries, childKey, childValue, summary, message);
        }
      }
      continue;
    }
    addRiskContextEntry(entries, key, value, summary, message);
  }

  if (!entries.length) {
    return null;
  }

  return entries.reduce<Record<string, unknown>>((acc, [key, value]) => {
    acc[key] = value;
    return acc;
  }, {});
};

const stripRiskEvaluationSummaryPrefix = (value: string | null): string | null => {
  if (!value) {
    return value;
  }

  const trimmedStart = value.trimStart();
  if (!trimmedStart.startsWith('Risk evaluation summary (')) {
    return value;
  }

  const match = trimmedStart.match(/^Risk evaluation summary \([^)]*\)\s*-\s*(.*)$/);
  if (!match) {
    return trimmedStart.trim();
  }

  const cleaned = match[1]?.trim() ?? '';
  return cleaned;
};

const mapStrategyRiskLogEntry = (
  payload?: StrategyRiskLogEntryPayload | null
): StrategyRiskLogEntry | null => {
  if (!payload || typeof payload !== 'object') {
    return null;
  }
  const timestampRaw = typeof payload.timestamp === 'string' ? payload.timestamp : null;
  const normalizedTimestamp =
    timestampRaw !== null ? normalizeTimestampToUtc(timestampRaw) ?? timestampRaw : null;
  try {
    console.debug('[RiskLogsAPI][entry]', { raw: timestampRaw, normalized: normalizedTimestamp });
  } catch (e) {
    void e;
  }
  const level = toStringOrNull(payload.level) ?? 'info';
  const action = toStringOrNull(payload.action) ?? 'unknown';
  const status = toStringOrNull(payload.status);
  const message = toStringOrNull(payload.message);
  const context = toRecordOrNull(payload.context);

  let summary: string | null = null;
  let checks: StrategyRiskLogCheck[] | null = null;
  let parsedRiskChecks: { summary: string | null; checks: StrategyRiskLogCheck[] } | null = null;
  let removeRootRiskChecks = false;
  let payloadReplacement: unknown = undefined;

  if (context) {
    const contextRecord = context as Record<string, unknown>;
    let riskChecksPayload: unknown = contextRecord.risk_checks ?? contextRecord.riskChecks;
    if (riskChecksPayload !== undefined) {
      removeRootRiskChecks = true;
    } else if ('payload' in contextRecord) {
      const payloadResult = findRiskChecksInPayload(contextRecord.payload);
      if (payloadResult.found) {
        riskChecksPayload = payloadResult.riskChecks;
        payloadReplacement = payloadResult.sanitized;
      }
    }
    parsedRiskChecks = normalizeRiskChecks(riskChecksPayload);
    if (parsedRiskChecks) {
      if (parsedRiskChecks.summary) {
        summary = parsedRiskChecks.summary;
      }
      if (parsedRiskChecks.checks.length) {
        checks = parsedRiskChecks.checks;
      }
    }
    if (!summary) {
      summary =
        toStringOrNull(
          contextRecord.summary ??
            contextRecord.detail ??
            contextRecord.description ??
            contextRecord.message
        ) ?? null;
    }
  }

  if (!summary) {
    summary = message ?? null;
  }

  summary = stripRiskEvaluationSummaryPrefix(summary);

  const sanitizeOptions: {
    removeRootRiskChecks?: boolean;
    payloadReplacement?: unknown;
  } = {};

  if (removeRootRiskChecks && parsedRiskChecks) {
    sanitizeOptions.removeRootRiskChecks = true;
  }

  if (payloadReplacement !== undefined) {
    sanitizeOptions.payloadReplacement = payloadReplacement ?? null;
  }

  const sanitizedContext = sanitizeRiskContext(context, summary, message ?? null, sanitizeOptions);

  return {
    timestamp: normalizedTimestamp ?? new Date(0).toISOString(),
    level,
    action,
    status,
    message,
    summary,
    checks,
    context: sanitizedContext
  };
};

const mapStrategyRiskLogsResponse = (
  payload: StrategyRiskLogsResponsePayload,
  fallbackStrategyId: number | string
): StrategyRiskLogsResult => {
  const entries = Array.isArray(payload?.entries)
    ? payload.entries
        .map((entry) => mapStrategyRiskLogEntry(entry))
        .filter((entry): entry is StrategyRiskLogEntry => Boolean(entry))
    : [];

  const strategyIdCandidate =
    typeof payload?.strategy_id === 'string' || typeof payload?.strategy_id === 'number'
      ? payload.strategy_id
      : fallbackStrategyId;
  const strategyId = ensureStrategyId(strategyIdCandidate);
  const page = toNumber(payload?.page) ?? 1;
  const pageSize = toNumber(payload?.page_size) ?? entries.length;
  const total = toNumber(payload?.total) ?? entries.length;
  const hasNext = toBoolean(payload?.has_next, false);
  const generatedAtRaw = typeof payload?.generated_at === 'string' ? payload.generated_at : null;
  const generatedAt =
    generatedAtRaw !== null ? normalizeTimestampToUtc(generatedAtRaw) ?? generatedAtRaw : null;
  try {
    console.debug('[RiskLogsAPI][response]', { generatedAtRaw, generatedAt });
  } catch (e) {
    void e;
  }

  return {
    strategyId,
    page,
    pageSize,
    total,
    hasNext,
    generatedAt,
    entries
  };
};

export const mapStrategyRecord = (payload: StrategyRecordPayload): StrategyItem => {
  const schedule = toStrategySchedule(payload);
  const parameters = Array.isArray(payload.parameters)
    ? payload.parameters.map((entry) => mapParameter(entry as Record<string, unknown>))
    : null;
  const metricsSnapshot = mapMetricsSnapshot(payload);
  const performancePayload = (payload as unknown as { performance?: { summary?: Record<string, unknown>; period?: string } }).performance;
  const performanceSnapshot = performancePayload && typeof performancePayload === 'object'
    ? {
        period: typeof performancePayload.period === 'string' ? performancePayload.period : 'day',
        summary: (performancePayload.summary ?? {}) as Record<string, number | string | null>
      }
    : null;
  const identifier = toIdentifier(payload.id, payload.strategy_id, payload.name) ?? 'unknown-strategy';
  const normalizedName =
    typeof payload.name === 'string' && payload.name.trim() ? payload.name.trim() : null;
  const title =
    typeof payload.title === 'string' && payload.title.trim()
      ? payload.title.trim()
      : null;
  const isKlineStrategyFlag = resolveIsKlineStrategyFlag(
    payload.is_kline_strategy,
    payload.data_feed_mode
  );

  return {
    id: identifier,
    name: title ?? normalizedName ?? identifier,
    symbol: extractSymbol(payload),
    status: toStrategyStatus(payload),
    mode: toStrategyMode(payload),
    returnRate: toReturnRate(payload),
    lastSignal: typeof payload.last_signal === 'string' ? payload.last_signal : null,
    description: typeof payload.description === 'string' ? payload.description : null,
    templateId: payload.strategy_type ?? payload.template ?? null,
    schedule,
    parameters,
    metricsSnapshot,
    performanceSnapshot,
    lastUpdatedAt: typeof payload.updated_at === 'string' ? payload.updated_at : null,
    enabled: typeof payload.enabled === 'boolean' ? payload.enabled : undefined,
    active: typeof payload.active === 'boolean' ? payload.active : undefined,
    tags: Array.isArray(payload.tags)
      ? payload.tags.filter((tag): tag is string => typeof tag === 'string')
      : null,
    dataSource:
      typeof payload.data_source === 'string' && payload.data_source.trim()
        ? payload.data_source.trim()
        : null,
    filePath:
      typeof payload.file_path === 'string' && payload.file_path.trim()
        ? payload.file_path.trim()
        : null,
    strategyOrigin:
      typeof payload.strategy_origin === 'string' && payload.strategy_origin.trim()
        ? payload.strategy_origin.trim()
        : null,
    isKlineStrategy:
      isKlineStrategyFlag !== null ? isKlineStrategyFlag : undefined,
    triggerCount: toNumber(payload.trigger_count),
    lastTriggeredAt:
      typeof payload.last_triggered_at === 'string'
        ? payload.last_triggered_at
        : typeof payload.updated_at === 'string'
          ? payload.updated_at
          : null,
    exit_config: Array.isArray(payload.exit_config) ? payload.exit_config : null,
    screenerProfile: toRecordOrNull(payload.screener_profile),
    screenerSchedule: toRecordOrNull(payload.screener_schedule)
  };
};

export const mapStrategyRecords = (payloads: StrategyRecordPayload[]): StrategyItem[] => {
  return payloads.map((payload) => mapStrategyRecord(payload));
};

const mapStrategyTemplate = (payload: StrategyTemplatePayload): StrategyTemplateItem => {
  const parametersSource = payload.parameters ?? null;
  const parameterEntries = parametersSource
    ? Object.entries(parametersSource).map(([key, entry]) => {
        if (!entry) {
          return null;
        }
        const normalized = { ...(entry as Record<string, unknown>) };
        const fallbackName = typeof key === 'string' ? key : String(key);

        const hasIdentifier = [normalized.name, normalized.key, normalized.id].some((value) => {
          if (typeof value === 'string') {
            return value.trim().length > 0;
          }
          return value != null;
        });
        if (!hasIdentifier) {
          normalized.name = fallbackName;
        }

        const labelCandidate =
          typeof normalized.label === 'string' ? normalized.label.trim() :
          typeof normalized.title === 'string' ? normalized.title.trim() :
          '';
        if (!labelCandidate) {
          normalized.label = fallbackName;
        }

        return mapParameter(normalized);
      })
    : [];
  const parameters = parameterEntries.filter((value): value is StrategyParameterConfig => Boolean(value));
  return {
    id: payload.identifier,
    name: payload.name ?? payload.identifier,
    description: typeof payload.description === 'string' ? payload.description : null,
    parameters: parameters.length ? parameters : null
  };
};

const mapStrategyFileMetadata = (
  metadata: StrategyFileMetadataPayload | null | undefined
): StrategyFileItem['metadata'] => {
  if (!metadata) {
    return null;
  }
  const schedulePayload = metadata.schedule ?? null;
  const windows = Array.isArray(schedulePayload?.windows)
    ? schedulePayload!.windows!
        .map((window) => {
          if (!window) {
            return null;
          }
          const startRaw = window.start ?? null;
          const endRaw = window.end ?? null;
          const start = typeof startRaw === 'string' ? startRaw : startRaw != null ? String(startRaw) : '';
          const end = typeof endRaw === 'string' ? endRaw : endRaw != null ? String(endRaw) : '';
          if (!start || !end) {
            return null;
          }
          return { start, end } as StrategyScheduleWindow;
        })
        .filter((entry): entry is StrategyScheduleWindow => Boolean(entry))
    : null;

  return {
    className: metadata.class_name ?? null,
    qualifiedName: metadata.qualified_name ?? null,
    baseClass: metadata.base_class ?? null,
    baseClassPath: metadata.base_class_path ?? null,
    strategyType: metadata.strategy_type ?? null,
    strategyName: metadata.strategy_name ?? null,
    filePath: metadata.file_path ?? null,
    description: metadata.description ?? null,
    parameters: metadata.parameters ?? null,
    schedule: schedulePayload
      ? {
          skipWeekends:
            typeof schedulePayload.skip_weekends === 'boolean'
              ? schedulePayload.skip_weekends
              : schedulePayload.skip_weekends == null
                ? null
                : Boolean(schedulePayload.skip_weekends),
          windows
        }
      : null,
    summaryPoints: metadata.summary_points ?? null
  };
};

const mapStrategyFile = (payload: StrategyFilePayload): StrategyFileItem => ({
  path: payload.path,
  name: payload.name,
  module: payload.module,
  metadata: mapStrategyFileMetadata(payload.metadata ?? null)
});

export const mapStrategyPerformance = (
  strategyId: string,
  payload: StrategyPerformanceResponse,
  period: string,
  existing?: StrategyPerformanceSnapshot | null,
  sections?: StrategyPerformanceSection[]
): StrategyPerformanceSnapshot => {
  const requestedSections = new Set(sections ?? []);
  const previous = existing && existing.period === period ? existing : null;
  const base: StrategyPerformanceSnapshot = previous ? { ...previous } : { period };

  const result: StrategyPerformanceSnapshot = {
    ...base,
    period
  };

  if (!previous && requestedSections.has('summary') && result.summary === undefined) {
    result.summary = {};
  }
  if (!previous && requestedSections.has('orders')) {
    result.orders = [];
    result.totalOrders = 0;
    result.page = 1;
    result.pageSize = 0;
    result.hasNext = false;
  }

  if (Object.prototype.hasOwnProperty.call(payload, 'summary')) {
    result.summary = mapPerformanceSummary(payload.summary ?? null);
  }

  if (Object.prototype.hasOwnProperty.call(payload, 'realtime')) {
    result.realtime = payload.realtime ? mapPerformanceSummary(payload.realtime) : null;
  }

  if (Object.prototype.hasOwnProperty.call(payload, 'updated_at')) {
    result.updatedAt = payload.updated_at ?? null;
  }

  if (Object.prototype.hasOwnProperty.call(payload, 'orders')) {
    if (payload.orders) {
      const items = Array.isArray(payload.orders.items) ? payload.orders.items : [];
      const orders: StrategyOrderItem[] = items.map((item, index) =>
        mapOrderItem(item ?? {}, index, strategyId)
      );
      result.orders = orders;
      result.totalOrders = payload.orders.total ?? orders.length;
      result.page = payload.orders.page ?? 1;
      result.pageSize =
        payload.orders.page_size ?? (orders.length > 0 ? orders.length : result.pageSize ?? 0);
      result.hasNext = Boolean(payload.orders.has_next);
    } else {
      result.orders = [];
      result.totalOrders = 0;
      result.page = 1;
      result.pageSize = 0;
      result.hasNext = false;
    }
  }

  if (Object.prototype.hasOwnProperty.call(payload, 'charts')) {
    result.charts = mapPerformanceCharts(payload.charts ?? null);
  }

  if (Object.prototype.hasOwnProperty.call(payload, 'calendar')) {
    result.calendar = mapPnLCalendar(payload.calendar ?? null);
  }

  if (Object.prototype.hasOwnProperty.call(payload, 'market_timezone')) {
    const marketTimezone = payload.market_timezone;
    result.marketTimezone =
      typeof marketTimezone === 'string' && marketTimezone.trim().length > 0
        ? marketTimezone
        : null;
  }

  return result;
};

export const mapStrategyMetrics = (
  payload: StrategyMetricsResponse,
  period?: string
): StrategyMetricsSnapshot | null => {
  return mapMetricsSnapshot(payload, period ?? payload.period ?? null);
};

export const fetchStrategyTemplates = async (
  token: string
): Promise<StrategyTemplateListResponse> => {
  return requestJson<StrategyTemplateListResponse>('/strategies/templates', token);
};

export const fetchStrategyFiles = async (
  token: string
): Promise<StrategyFileListResponse> => {
  return requestJson<StrategyFileListResponse>('/strategies/files', token);
};

export const fetchStrategies = async (
  token: string,
  options?: { compact?: boolean; sections?: string[]; period?: string; refresh?: boolean }
): Promise<StrategyListResponse> => {
  const searchParams = new URLSearchParams();
  if (options?.compact) {
    searchParams.set('compact', 'true');
  }
  if (options?.sections && options.sections.length) {
    searchParams.set('sections', options.sections.join(','));
  }
  if (options?.period) {
    searchParams.set('period', options.period);
  }
  if (options?.refresh) {
    searchParams.set('refresh', 'true');
  }
  const query = searchParams.toString();
  const endpoint = `/strategies${query ? `?${query}` : ''}`;
  return requestJson<StrategyListResponse>(endpoint, token);
};

// 已废弃：使用独立的标签页API替代
// export const fetchStrategyPerformance = async (...) => { ... }

export interface StrategyPerformanceSummaryParams {
  strategyId: number | string;
  period?: string;
}

export interface StrategyPerformanceOrdersParams {
  strategyId: number | string;
  period?: string;
  page?: number;
  pageSize?: number;
  startDate?: string; // ISO date string
  endDate?: string; // ISO date string
}

export interface StrategyPerformanceChartsParams {
  strategyId: number | string;
  period?: string;
}

export interface StrategyPerformanceCalendarParams {
  strategyId: number | string;
  period?: string;
}

export const fetchStrategyPerformanceSummary = async (
  token: string,
  params: StrategyPerformanceSummaryParams
): Promise<StrategyPerformanceResponse> => {
  const strategyKey = ensureStrategyId(params.strategyId);
  const searchParams = new URLSearchParams();
  searchParams.set('period', params.period ?? 'day');
  const query = searchParams.toString();
  // Merged endpoint: metrics now includes summary and market_timezone
  const endpoint = `/strategies/${strategyKey}/metrics${query ? `?${query}` : ''}`;
  return requestJson<StrategyPerformanceResponse>(endpoint, token);
};

export const fetchStrategyPerformanceOrders = async (
  token: string,
  params: StrategyPerformanceOrdersParams
): Promise<StrategyPerformanceResponse> => {
  const strategyKey = ensureStrategyId(params.strategyId);
  const searchParams = new URLSearchParams();
  searchParams.set('period', params.period ?? 'day');
  searchParams.set('page', String(params.page ?? 1));
  searchParams.set('page_size', String(params.pageSize ?? 10));
  if (params.startDate) {
    searchParams.set('start_date', params.startDate);
  }
  if (params.endDate) {
    searchParams.set('end_date', params.endDate);
  }
  const query = searchParams.toString();
  const endpoint = `/strategies/${strategyKey}/performance/orders${query ? `?${query}` : ''}`;
  return requestJson<StrategyPerformanceResponse>(endpoint, token);
};

export const fetchStrategyPerformanceCharts = async (
  token: string,
  params: StrategyPerformanceChartsParams
): Promise<StrategyPerformanceResponse> => {
  const strategyKey = ensureStrategyId(params.strategyId);
  const searchParams = new URLSearchParams();
  searchParams.set('period', params.period ?? 'day');
  const query = searchParams.toString();
  const endpoint = `/strategies/${strategyKey}/performance/charts${query ? `?${query}` : ''}`;
  return requestJson<StrategyPerformanceResponse>(endpoint, token);
};

export const fetchStrategyPerformanceCalendar = async (
  token: string,
  params: StrategyPerformanceCalendarParams
): Promise<StrategyPerformanceResponse> => {
  const strategyKey = ensureStrategyId(params.strategyId);
  const searchParams = new URLSearchParams();
  searchParams.set('period', params.period ?? 'day');
  const query = searchParams.toString();
  const endpoint = `/strategies/${strategyKey}/performance/calendar${query ? `?${query}` : ''}`;
  return requestJson<StrategyPerformanceResponse>(endpoint, token);
};

export interface StrategiesPerformanceEvaluateParams {
  startDate?: string | null;
  endDate?: string | null;
  strategyIds?: Array<number | string> | null;
}

export interface StrategiesPerformanceEvaluateResponse {
  strategies: Array<{
    strategy_id?: number | string;
    id?: number | string;
    name?: string | null;
    symbol?: string | null;
    summary?: Record<string, number | string | null>;
  }>;
  start_date?: string | null;
  end_date?: string | null;
  market_timezone?: string | null;
}

export const fetchStrategiesPerformanceEvaluate = async (
  token: string,
  params: StrategiesPerformanceEvaluateParams
): Promise<StrategiesPerformanceEvaluateResponse> => {
  const searchParams = new URLSearchParams();
  if (params.startDate) searchParams.set('start_date', params.startDate);
  if (params.endDate) searchParams.set('end_date', params.endDate);
  if (params.strategyIds && params.strategyIds.length) {
    for (const id of params.strategyIds) {
      searchParams.append('strategy_ids', String(id));
    }
  }
  const query = searchParams.toString();
  const endpoint = `/strategies/performance/evaluate${query ? `?${query}` : ''}`;
  return requestJson<StrategiesPerformanceEvaluateResponse>(endpoint, token);
};

export const fetchStrategyCandles = async (
  token: string,
  params: StrategyCandlesParams
): Promise<StrategyCandlesResponse> => {
  const strategyKey = ensureStrategyId(params.strategyId);
  const searchParams = new URLSearchParams();
  if (params.interval) {
    searchParams.set('interval', params.interval);
  }
  const query = searchParams.toString();
  const endpoint = `/strategies/${strategyKey}/candles${query ? `?${query}` : ''}`;
  return requestJson<StrategyCandlesResponse>(endpoint, token);
};

export const fetchStrategyMetrics = async (
  token: string,
  params: StrategyMetricsParams
): Promise<StrategyMetricsResponse> => {
  const strategyKey = ensureStrategyId(params.strategyId);
  const searchParams = new URLSearchParams();
  if (params.period) {
    searchParams.set('period', params.period);
  }
  const query = searchParams.toString();
  const endpoint = `/strategies/${strategyKey}/metrics${query ? `?${query}` : ''}`;
  return requestJson<StrategyMetricsResponse>(endpoint, token);
};

export interface StrategyMetricsResetParams {
  strategyId: number | string;
  period?: string;
}

export interface StrategyMetricsResetResponse {
  strategy_id?: number | string | null;
  id?: number | string | null;
  name?: string | null;
  period?: string | null;
  status?: string | null;
  updated_at?: string | null;
}

export const resetStrategyMetricsCache = async (
  token: string,
  params: StrategyMetricsResetParams
): Promise<StrategyMetricsResetResponse> => {
  const strategyKey = ensureStrategyId(params.strategyId);
  const searchParams = new URLSearchParams();
  if (params.period) {
    searchParams.set('period', params.period);
  }
  const query = searchParams.toString();
  const endpoint = `/strategies/${strategyKey}/metrics/reset${query ? `?${query}` : ''}`;
  return requestJson<StrategyMetricsResetResponse>(endpoint, token, { method: 'POST' });
};

export const fetchStrategyDetail = async (
  token: string,
  strategyId: string
): Promise<StrategyDetailResponsePayload> => {
  return requestJson<StrategyDetailResponsePayload>(`/strategies/${strategyId}`, token);
};

export const fetchStrategyRuntimeDetail = async (
  token: string,
  params: StrategyRuntimeParams
): Promise<StrategyRuntimeResponsePayload> => {
  const strategyKey = ensureStrategyId(params.strategyId);
  const searchParams = new URLSearchParams();
  if (params.refresh) {
    searchParams.set('refresh', 'true');
  }
  const query = searchParams.toString();
  const endpoint = `/strategies/${strategyKey}/runtime${query ? `?${query}` : ''}`;
  return requestJson<StrategyRuntimeResponsePayload>(endpoint, token);
};

export const fetchStrategyRiskSettingsDetail = async (
  token: string,
  strategyId: string
): Promise<StrategyRiskSettingsResponse> => {
  return requestJson<StrategyRiskSettingsResponse>(`/strategies/${strategyId}/risk-settings`, token);
};

export const fetchStrategyRiskLogs = async (
  token: string,
  params: StrategyRiskLogsParams
): Promise<StrategyRiskLogsResult> => {
  const strategyKey = ensureStrategyId(params.strategyId);
  const searchParams = new URLSearchParams();
  if (params.page !== undefined) {
    searchParams.set('page', String(params.page));
  }
  if (params.pageSize !== undefined) {
    searchParams.set('page_size', String(params.pageSize));
  }
  if (params.limit !== undefined) {
    searchParams.set('limit', String(params.limit));
  }
  const query = searchParams.toString();
  const endpoint = `/strategies/${strategyKey}/risk-logs${query ? `?${query}` : ''}`;
  const payload = await requestJson<StrategyRiskLogsResponsePayload>(endpoint, token);
  return mapStrategyRiskLogsResponse(payload, params.strategyId);
};

export const postStrategySummaryUpdate = async (
  token: string,
  params: StrategySummaryUpdateParams
): Promise<StrategySummaryUpdateResponse> => {
  const body: Record<string, unknown> = {};
  if (params.primarySymbol !== undefined) {
    body.primary_symbol = params.primarySymbol;
  }
  if (params.dataSource !== undefined) {
    body.data_source = params.dataSource;
  }
  if (params.triggerCount !== undefined) {
    body.trigger_count = params.triggerCount;
  }
  if (params.lastTriggeredAt !== undefined) {
    body.last_triggered_at = params.lastTriggeredAt;
  }
  if (params.strategyOrigin !== undefined) {
    body.strategy_origin = params.strategyOrigin;
  }
  if (params.scheduleTimezone !== undefined) {
    body.schedule_timezone = params.scheduleTimezone;
  }
  const strategyKey = ensureStrategyId(params.strategyId);
  return requestJson<StrategySummaryUpdateResponse>(
    `/strategies/${strategyKey}/summary`,
    token,
    {
      method: 'POST',
      body: JSON.stringify(body)
    }
  );
};

const sanitizeParameterOverrides = (
  overrides: Record<string, unknown>
): Record<string, unknown> => {
  return Object.entries(overrides).reduce<Record<string, unknown>>((accumulator, [key, value]) => {
    if (!key) {
      return accumulator;
    }
    if (value !== undefined) {
      accumulator[key] = value;
    }
    return accumulator;
  }, {});
};

export const postStrategyParameterUpdate = async (
  token: string,
  params: StrategyParameterUpdateParams
): Promise<StrategyParameterUpdateResponse> => {
  const body = {
    parameters: sanitizeParameterOverrides(params.parameters ?? {})
  };
  return requestJson<StrategyParameterUpdateResponse>(
    `/strategies/${params.strategyId}/parameters`,
    token,
    {
      method: 'POST',
      body: JSON.stringify(body)
    }
  );
};

export const updateStrategyParametersRequest = async (
  token: string,
  params: StrategyParameterUpdateParams
): Promise<StrategyParameterUpdateResponse> => {
  const response = await postStrategyParameterUpdate(token, params);
  const applied = response.parameters ?? {};
  const normalized = Object.entries(applied).reduce<Record<string, unknown>>((accumulator, [key, value]) => {
    if (!key) {
      return accumulator;
    }
    accumulator[key] = value;
    return accumulator;
  }, {});
  return { parameters: normalized, exit_config: response.exit_config ?? null };
};

export const postStrategyRiskSettings = async (
  token: string,
  params: StrategyRiskSettingsMutation
): Promise<StrategyRiskSettingsResponse> => {
  const body: Record<string, unknown> = {};
  if (params.maxPosition !== undefined) {
    body.max_position = params.maxPosition;
  }
  if (params.forbidPyramiding !== undefined) {
    body.forbid_pyramiding = params.forbidPyramiding;
  }
  if (params.lossThreshold !== undefined) {
    body.loss_threshold = params.lossThreshold;
  }
  if (params.lossDurationMinutes !== undefined) {
    body.loss_duration_minutes = params.lossDurationMinutes;
  }
  if (params.notifyOnBreach !== undefined) {
    body.notify_on_breach = params.notifyOnBreach;
  }
  return requestJson<StrategyRiskSettingsResponse>(
    `/strategies/${params.strategyId}/risk-settings`,
    token,
    {
      method: 'POST',
      body: JSON.stringify(body)
    }
  );
};

const normalizeParameterValue = (value: unknown): unknown => {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed.length) {
      return null;
    }
    if (trimmed === 'true' || trimmed === 'false') {
      return trimmed === 'true';
    }
    const parsed = Number(trimmed);
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
    return trimmed;
  }
  return value ?? null;
};

const toParameterRequest = (parameter: StrategyParameterConfig): Record<string, unknown> => {
  const payload: Record<string, unknown> = {
    name: parameter.name,
    label: parameter.label ?? parameter.name,
    type: parameter.type ?? null,
    value: normalizeParameterValue(parameter.value),
    description: parameter.description ?? null
  };
  if (parameter.options?.length) {
    payload.options = parameter.options.map((option) => ({
      value: option.value,
      label: option.label
    }));
  }
  if (typeof parameter.min === 'number') {
    payload.min = parameter.min;
  }
  if (typeof parameter.max === 'number') {
    payload.max = parameter.max;
  }
  if (typeof parameter.step === 'number') {
    payload.step = parameter.step;
  }
  if (parameter.defaultValue !== undefined) {
    payload.default = parameter.defaultValue;
  }
  return payload;
};

const toParameterOverrides = (
  parameters: StrategyParameterConfig[] | null | undefined
): Record<string, unknown> => {
  if (!parameters?.length) {
    return {};
  }

  return parameters.reduce<Record<string, unknown>>((accumulator, parameter) => {
    const key = parameter.name?.trim();
    if (!key) {
      return accumulator;
    }
    accumulator[key] = parameter.value ?? parameter.defaultValue ?? null;
    return accumulator;
  }, {});
};

const toSchedulePayload = (
  payload: StrategyMutationPayload
): { skip_weekends: boolean; windows: StrategyScheduleWindow[] } => {
  const windows = (payload.windows ?? [])
    .filter((window) => Boolean(window.start) && Boolean(window.end))
    .map((window) => ({ start: window.start, end: window.end }));

  return {
    skip_weekends: payload.skipWeekends ?? true,
    windows
  };
};

const toStrategyMutationBody = (payload: StrategyMutationPayload): Record<string, unknown> => {
  const strategyId = payload.name.trim();
  const templateId = payload.templateId ?? null;
  const schedule = toSchedulePayload(payload);
  const parameters = toParameterOverrides(payload.parameters ?? null);
  const rawFilePath = typeof payload.filePath === 'string' ? payload.filePath.trim() : '';
  const filePath = rawFilePath ? rawFilePath.replace(/\\/g, '/') : null;

  const body: Record<string, unknown> = {
    strategy_id: strategyId,
    strategy_type: templateId,
    title: payload.name,
    description: payload.description ?? null,
    file_path: filePath,
    enabled: payload.enabled ?? true,
    parameters,
    schedule,
    auto_start: payload.active ?? false,
    ignore_schedule: false,
    // Backwards compatible fields retained for downstream consumers relying on the legacy shape.
    name: payload.name,
    symbol: payload.symbol,
    instrument: payload.symbol,
    mode: payload.mode,
    template: templateId,
    active: payload.active ?? false,
    skip_weekends: schedule.skip_weekends,
    windows: schedule.windows,
    parameters_legacy:
      payload.parameters?.map((parameter) => toParameterRequest(parameter)) ?? []
  };

  if (payload.tags && payload.tags.length) {
    body.tags = payload.tags;
  }

  body.filePath = filePath;

  if (payload.screenerProfile !== undefined) {
    body.screener_profile = payload.screenerProfile;
  }
  if (payload.screenerSchedule !== undefined) {
    body.screener_schedule = payload.screenerSchedule;
  }

  return body;
};

export const startStrategyRequest = async (
  token: string,
  params: StrategyStartParams
): Promise<StrategyRecordPayload> => {
  const searchParams = new URLSearchParams();
  if (params.ignoreSchedule) {
    searchParams.set('ignore_schedule', 'true');
  }
  const query = searchParams.toString();
  const endpoint = `/strategies/${params.strategyId}/start${query ? `?${query}` : ''}`;
  const response = await requestJson<{ strategy: StrategyRecordPayload }>(endpoint, token, {
    method: 'POST'
  });
  return response.strategy;
};

export const resyncStrategySubscriptionRequest = async (
  token: string,
  strategyId: string
): Promise<StrategySubscriptionResyncResponse> => {
  return requestJson<StrategySubscriptionResyncResponse>(
    `/strategies/${strategyId}/subscription/resync`,
    token,
    { method: 'POST' }
  );
};

export const stopStrategyRequest = async (
  token: string,
  params: StrategyStopParams
): Promise<StrategyRecordPayload> => {
  const response = await requestJson<{ strategy: StrategyRecordPayload }>(
    `/strategies/${params.strategyId}/stop`,
    token,
    { method: 'POST' }
  );
  return response.strategy;
};

export const deleteStrategyRequest = async (
  token: string,
  params: StrategyDeleteParams
): Promise<void> => {
  await requestJson<Record<string, unknown> | null>(`/strategies/${params.strategyId}`, token, {
    method: 'DELETE'
  });
};

export const listStrategiesMapped = async (
  token: string,
  params?: { refresh?: boolean; period?: string }
): Promise<StrategyItem[]> => {
  const response = await fetchStrategies(token, {
    compact: true,
    sections: ['summary', 'metrics'],
    period: params?.period ?? 'day',
    refresh: params?.refresh === true
  });
  return mapStrategyRecords(response.strategies ?? []);
};

export const listStrategyTemplatesMapped = async (token: string): Promise<StrategyTemplateItem[]> => {
  const response = await fetchStrategyTemplates(token);
  return (response.templates ?? []).map((template) => mapStrategyTemplate(template));
};

export const listStrategyFilesMapped = async (token: string): Promise<StrategyFileItem[]> => {
  const response = await fetchStrategyFiles(token);
  return (response.files ?? []).map((file) => mapStrategyFile(file));
};

// 已废弃：使用独立的标签页API替代
// export const getStrategyPerformanceSnapshot = async (...) => { ... }

export const getStrategyMetricsSnapshot = async (
  token: string,
  params: StrategyMetricsParams
): Promise<StrategyMetricsSnapshot | null> => {
  const payload = await fetchStrategyMetrics(token, params);
  return mapStrategyMetrics(payload, params.period ?? payload.period ?? undefined);
};

export const getStrategyCandlesSnapshot = async (
  token: string,
  params: StrategyCandlesParams
): Promise<StrategyCandlesSnapshot> => {
  const payload = await fetchStrategyCandles(token, params);
  return mapCandlesSnapshot(payload);
};

export const createStrategyRequest = async (
  token: string,
  payload: StrategyMutationPayload
): Promise<StrategyMutationResponse> => {
  const body = toStrategyMutationBody(payload);
  const response = await requestJson<StrategyMutationResponse>('/strategies', token, {
    method: 'POST',
    body: JSON.stringify(body)
  });
  return response;
};

export const updateStrategyRequest = async (
  token: string,
  params: { strategyId: string; payload: StrategyMutationPayload }
): Promise<StrategyMutationResponse> => {
  const body = toStrategyMutationBody(params.payload);
  const response = await requestJson<StrategyMutationResponse>(
    `/strategies/${params.strategyId}`,
    token,
    {
      method: 'PUT',
      body: JSON.stringify(body)
    }
  );
  return response;
};

export const getStrategyDetailSnapshot = async (
  token: string,
  strategyId: string
): Promise<{ detail: StrategyDetailSummary; runtime: StrategyRuntimeDetail; risk: StrategyRiskSettings }> => {
  const payload = await fetchStrategyDetail(token, strategyId);
  const configPayload = payload.config ?? null;

  let detail: StrategyDetailSummary;
  if (configPayload) {
    detail = mapStrategyDetailSummary(configPayload);
  } else if (payload.strategy) {
    const record = mapStrategyRecord(payload.strategy as unknown as StrategyRecordPayload);
    detail = {
      id: record.id,
      name: record.name,
      description: record.description ?? null,
      strategyType: record.templateId ?? null,
      primarySymbol: record.symbol,
      dataSource: record.dataSource ?? null,
      strategyOrigin: record.strategyOrigin ?? null,
      filePath: record.filePath ?? null,
      triggerCount: record.triggerCount ?? null,
      lastTriggeredAt: record.lastTriggeredAt ?? record.lastUpdatedAt ?? null,
      schedule: record.schedule ?? null,
      createdAt: record.lastUpdatedAt ?? null,
      updatedAt: record.lastUpdatedAt ?? null,
      parameters: record.parameters
        ? record.parameters.reduce<Record<string, unknown>>((accumulator, parameter) => {
            accumulator[parameter.name] = parameter.value ?? parameter.defaultValue ?? null;
            return accumulator;
          }, {})
        : null,
      parameterDefinitions: record.parameters ?? null,
      isKlineStrategy: record.isKlineStrategy
    };
  } else {
    const fallbackId = toIdentifier(strategyId) ?? 'unknown-strategy';
    detail = {
      id: fallbackId,
      name: fallbackId,
      description: null,
      strategyType: null,
      primarySymbol: null,
      dataSource: null,
      strategyOrigin: null,
      triggerCount: null,
      lastTriggeredAt: null,
      schedule: null,
      createdAt: null,
      updatedAt: null,
      parameters: null,
      parameterDefinitions: null
    };
  }

  const runtime = mapRuntimeDetailFromPayload(detail.id, payload.runtime ?? null);
  const risk = mapRiskSettingsRecord(detail.id, payload.risk ?? null);

  return { detail, runtime, risk };
};

export const getStrategyRuntimeSnapshot = async (
  token: string,
  params: StrategyRuntimeParams
): Promise<StrategyRuntimeDetail> => {
  const payload = await fetchStrategyRuntimeDetail(token, params);
  const strategyKey = ensureStrategyId(params.strategyId);
  try {
    const snapshot = (payload?.snapshot ?? null) as Record<string, unknown> | null;
    console.debug('[RuntimeAPI][fetch]', {
      strategyId: strategyKey,
      refreshed_at: snapshot && typeof snapshot.refreshed_at === 'string' ? snapshot.refreshed_at : null,
      updated_at: snapshot && typeof snapshot.updated_at === 'string' ? snapshot.updated_at : null
    });
  } catch (e) {
    void e;
  }
  return mapRuntimeDetailFromPayload(strategyKey, payload);
};

export const updateStrategySummary = async (
  token: string,
  params: StrategySummaryUpdateParams
): Promise<StrategyDetailSummary> => {
  const response = await postStrategySummaryUpdate(token, params);
  const summaryPayload = response.summary ?? response.config ?? null;
  if (summaryPayload) {
    return mapStrategyDetailSummary(summaryPayload);
  }
  const fallbackId = toIdentifier(params.strategyId) ?? 'unknown-strategy';
  return {
    id: fallbackId,
    name: fallbackId,
    description: null,
    strategyType: null,
    primarySymbol: params.primarySymbol ?? null,
    dataSource: params.dataSource ?? null,
    strategyOrigin: params.strategyOrigin ?? null,
    triggerCount: params.triggerCount ?? null,
    lastTriggeredAt: params.lastTriggeredAt ?? null,
    schedule: null,
    createdAt: null,
    updatedAt: null,
    parameters: null
  };
};

export const getStrategyRiskSettings = async (
  token: string,
  strategyId: string
): Promise<StrategyRiskSettings> => {
  const payload = await fetchStrategyRiskSettingsDetail(token, strategyId);
  return mapRiskSettingsRecord(strategyId, payload.risk_settings ?? null);
};

export const saveStrategyRiskSettingsRequest = async (
  token: string,
  params: StrategyRiskSettingsMutation
): Promise<StrategyRiskSettings> => {
  const payload = await postStrategyRiskSettings(token, params);
  return mapRiskSettingsRecord(params.strategyId, payload.risk_settings ?? null);
};

export interface ScreenerMetadataOption {
  value: string;
  label: string;
  description: string | null;
  instruments?: string[] | null;
  filters?: string[] | null;
}

export interface ScreenerFilterDefinition {
  name: string;
  label: string;
  type: string;
  description: string | null;
  options?: ScreenerMetadataOption[] | null;
  group?: string | null;
  min?: number | null;
  max?: number | null;
  step?: number | null;
}

export interface ScreenerMetadata {
  source: string | null;
  raw?: string | null;
  instruments: ScreenerMetadataOption[];
  locations: ScreenerMetadataOption[];
  scanCodes: ScreenerMetadataOption[];
  filters: ScreenerFilterDefinition[];
}

export interface ScreenerResultSymbol {
  id: string;
  symbol: string;
  rank?: number | null;
  metadata?: Record<string, unknown> | null;
  openPrice?: number | null;
  closePrice?: number | null;
  returnRate?: number | null;
}

export interface ScreenerResultRecord {
  id: number | string;
  strategyId: number | string;
  runId: string;
  runAt?: string | null;
  tradingDate?: string | null;
  screenerProfile?: Record<string, unknown> | null;
  screenerSchedule?: Record<string, unknown> | null;
  symbols?: ScreenerResultSymbol[] | null;
}

const parseScreenerMetadataOptions = (nodes: Element[]): ScreenerMetadataOption[] => {
  const options: ScreenerMetadataOption[] = [];
  nodes.forEach((node) => {
    const value =
      node.querySelector('name')?.textContent?.trim() ||
      node.querySelector('value')?.textContent?.trim() ||
      node.querySelector('code')?.textContent?.trim() ||
      node.querySelector('scanCode')?.textContent?.trim() ||
      node.querySelector('location')?.textContent?.trim() ||
      node.querySelector('instrument')?.textContent?.trim() ||
      node.getAttribute('name')?.trim() ||
      node.getAttribute('value')?.trim() ||
      node.getAttribute('code')?.trim() ||
      '';
    if (!value) {
      return;
    }
    const description = node.querySelector('description')?.textContent?.trim() || null;
    const label =
      node.querySelector('displayName')?.textContent?.trim() ||
      node.querySelector('label')?.textContent?.trim() ||
      description ||
      value;
    options.push({ value, label, description });
  });
  return options;
};

const splitValueList = (value: string): string[] => {
  if (!value) {
    return [];
  }
  return value
    .split(/[;,]+/)
    .map((entry) => entry.trim())
    .filter(Boolean);
};

const toNumberOrNull = (value: string | null): number | null => {
  if (!value) {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const parseScreenerMetadataFilters = (nodes: Element[]): ScreenerFilterDefinition[] => {
  const filters: ScreenerFilterDefinition[] = [];
  nodes.forEach((node) => {
    const name =
      node.querySelector('name')?.textContent?.trim() ||
      node.getAttribute('name')?.trim() ||
      '';
    if (!name) {
      return;
    }
    const label =
      node.querySelector('displayName')?.textContent?.trim() ||
      node.querySelector('label')?.textContent?.trim() ||
      name;
    const type =
      node.querySelector('type')?.textContent?.trim() ||
      node.getAttribute('type')?.trim() ||
      'string';
    const description = node.querySelector('description')?.textContent?.trim() || null;
    const valueListRaw = node.querySelector('valueList')?.textContent?.trim() || '';
    const options = splitValueList(valueListRaw).map((value) => ({ value, label: value, description: null }));
    const min = toNumberOrNull(node.querySelector('minValue')?.textContent ?? null);
    const max = toNumberOrNull(node.querySelector('maxValue')?.textContent ?? null);
    const step = toNumberOrNull(node.querySelector('increment')?.textContent ?? null);
    filters.push({
      name,
      label,
      type,
      description,
      options: options.length ? options : null,
      min,
      max,
      step
    });
  });
  return filters;
};

const normalizeMetadataOption = (entry: unknown): ScreenerMetadataOption | null => {
  if (typeof entry === 'string') {
    const trimmed = entry.trim();
    if (!trimmed) {
      return null;
    }
    return { value: trimmed, label: trimmed, description: null };
  }
  if (entry && typeof entry === 'object') {
    const record = entry as Record<string, unknown>;
    const rawValue = record.value ?? record.code ?? record.name ?? record.id ?? record.key ?? '';
    const rawLabel =
      record.label ??
      record.displayName ??
      record.title ??
      record.name ??
      record.description ??
      rawValue;
    const value = typeof rawValue === 'string' ? rawValue.trim() : String(rawValue ?? '').trim();
    if (!value) {
      return null;
    }
    const label = typeof rawLabel === 'string' ? rawLabel.trim() : String(rawLabel ?? '').trim();
    const description =
      typeof record.description === 'string' ? record.description.trim() : null;
    const instruments = normalizeInstrumentList(record.instruments);
    const filters = normalizeStringList(record.filters);
    return {
      value,
      label: label || value,
      description: description || null,
      instruments,
      filters
    };
  }
  return null;
};

const normalizeInstrumentList = (value: unknown): string[] | null => {
  if (Array.isArray(value)) {
    const items = value
      .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
      .filter((entry) => entry.length > 0);
    return items.length ? items : null;
  }
  if (typeof value === 'string') {
    const items = value
      .split(',')
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);
    return items.length ? items : null;
  }
  return null;
};

const normalizeStringList = (value: unknown): string[] | null => {
  if (Array.isArray(value)) {
    const items = value
      .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
      .filter((entry) => entry.length > 0);
    return items.length ? items : null;
  }
  if (typeof value === 'string') {
    const items = value
      .split(',')
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);
    return items.length ? items : null;
  }
  return null;
};

const normalizeMetadataOptions = (entries: unknown): ScreenerMetadataOption[] => {
  if (!Array.isArray(entries)) {
    return [];
  }
  return entries
    .map((entry) => normalizeMetadataOption(entry))
    .filter((entry): entry is ScreenerMetadataOption => Boolean(entry));
};

const normalizeFilterDefinitions = (entries: unknown): ScreenerFilterDefinition[] => {
  if (!Array.isArray(entries)) {
    return [];
  }
  return entries
    .map((entry): ScreenerFilterDefinition | null => {
      if (!entry || typeof entry !== 'object') {
        return null;
      }
      const record = entry as Record<string, unknown>;
      const name = record.name ?? record.key ?? record.id ?? '';
      if (typeof name !== 'string' || !name.trim()) {
        return null;
      }
      const label = typeof record.label === 'string' ? record.label : name;
      const type = typeof record.type === 'string' ? record.type : 'string';
      const description =
        typeof record.description === 'string' ? record.description : null;
      const options = normalizeMetadataOptions(record.options);
      return {
        name: name.trim(),
        label,
        type,
        description,
        options: options.length ? options : null,
        group: typeof record.group === 'string' ? record.group : null,
        min: typeof record.min === 'number' ? record.min : null,
        max: typeof record.max === 'number' ? record.max : null,
        step: typeof record.step === 'number' ? record.step : null
      } satisfies ScreenerFilterDefinition;
    })
    .filter((entry): entry is ScreenerFilterDefinition => Boolean(entry));
};

const parseScreenerMetadataPayload = (
  payload: { source?: string | null; metadata?: unknown }
): ScreenerMetadata => {
  const source = typeof payload.source === 'string' ? payload.source : null;
  const raw = typeof payload.metadata === 'string' ? payload.metadata : null;
  const payloadRecord = payload as Record<string, unknown>;
  const instrumentTypes = normalizeMetadataOptions(payloadRecord.instrumentTypes);
  const locationCodes = normalizeMetadataOptions(payloadRecord.locationCodes);
  const scanCodesFromPayload = normalizeMetadataOptions(payloadRecord.scanCodes);
  const filterDefinitions = normalizeFilterDefinitions(payloadRecord.filterDefinitions);
  if (
    instrumentTypes.length ||
    locationCodes.length ||
    scanCodesFromPayload.length ||
    filterDefinitions.length
  ) {
    return {
      source,
      raw: raw ?? null,
      instruments: instrumentTypes,
      locations: locationCodes,
      scanCodes: scanCodesFromPayload,
      filters: filterDefinitions
    };
  }
  const metadataObject =
    payload.metadata && typeof payload.metadata === 'object'
      ? (payload.metadata as Record<string, unknown>)
      : null;
  const rawText = raw?.trim() ?? '';
  const jsonCandidate = rawText.startsWith('{') || rawText.startsWith('[');
  const parsedFromRaw = (() => {
    if (!jsonCandidate) {
      return null;
    }
    try {
      return JSON.parse(rawText) as Record<string, unknown>;
    } catch (_error) {
      return null;
    }
  })();

  const normalizedMetadata = metadataObject || parsedFromRaw;
  if (normalizedMetadata) {
    const instruments = normalizeMetadataOptions(normalizedMetadata.instruments);
    const locations = normalizeMetadataOptions(normalizedMetadata.locations);
    const scanCodes = normalizeMetadataOptions(
      normalizedMetadata.scanCodes ?? normalizedMetadata.scan_codes
    );
    const filters = normalizeFilterDefinitions(
      normalizedMetadata.filters ?? normalizedMetadata.filterDefinitions
    );
    if (instruments.length || locations.length || scanCodes.length || filters.length) {
      return {
        source,
        raw: raw ?? null,
        instruments,
        locations,
        scanCodes,
        filters
      };
    }
  }
  if (!raw) {
    return {
      source,
      raw: raw ?? null,
      instruments: [],
      locations: [],
      scanCodes: [],
      filters: []
    };
  }
  if (typeof DOMParser === 'undefined') {
    return {
      source,
      raw,
      instruments: [],
      locations: [],
      scanCodes: [],
      filters: []
    };
  }
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(raw, 'application/xml');
    const instruments = parseScreenerMetadataOptions(
      Array.from(doc.querySelectorAll('InstrumentList > Instrument'))
    );
    const locations = parseScreenerMetadataOptions(
      Array.from(doc.querySelectorAll('LocationList > Location'))
    );
    const scanCodes = parseScreenerMetadataOptions(
      Array.from(doc.querySelectorAll('ScanCodeList > ScanCode'))
    );
    const filters = parseScreenerMetadataFilters(Array.from(doc.querySelectorAll('TagList > Tag')));
    return {
      source,
      raw,
      instruments,
      locations,
      scanCodes,
      filters
    };
  } catch (_error) {
    return {
      source,
      raw,
      instruments: [],
      locations: [],
      scanCodes: [],
      filters: []
    };
  }
};

const createScreenerIdentifier = (): string => Math.random().toString(36).slice(2, 10);

const mapScreenerResultSymbol = (payload: Record<string, unknown>): ScreenerResultSymbol => {
  const id = toIdentifier(payload.id, payload.symbol) ?? createScreenerIdentifier();
  return {
    id,
    symbol: typeof payload.symbol === 'string' ? payload.symbol : '--',
    rank: toNumber(payload.rank),
    metadata: toRecordOrNull(payload.metadata),
    openPrice: toNumber(payload.open_price),
    closePrice: toNumber(payload.close_price),
    returnRate: toNumber(payload.return_rate)
  };
};

const mapScreenerResultRecord = (payload: Record<string, unknown>): ScreenerResultRecord => {
  const id =
    (payload.id as number | string | undefined) ??
    (typeof payload.run_id === 'string' ? payload.run_id : createScreenerIdentifier());
  const strategyId = (payload.strategy_id ?? payload.strategyId ?? '') as number | string;
  const runId = typeof payload.run_id === 'string' ? payload.run_id : String(payload.run_id ?? '');
  const symbols = Array.isArray(payload.symbols)
    ? payload.symbols.map((entry) => mapScreenerResultSymbol(entry as Record<string, unknown>))
    : null;
  return {
    id,
    strategyId,
    runId,
    runAt: typeof payload.run_at === 'string' ? payload.run_at : null,
    tradingDate: typeof payload.trading_date === 'string' ? payload.trading_date : null,
    screenerProfile: toRecordOrNull(payload.screener_profile),
    screenerSchedule: toRecordOrNull(payload.screener_schedule),
    symbols
  };
};

export const fetchScreenerMetadata = async (token: string): Promise<ScreenerMetadata> => {
  const response = await requestJson<{ source?: string | null; metadata?: unknown }>(
    '/strategies/screener/metadata',
    token
  );
  return parseScreenerMetadataPayload(response ?? {});
};

export const listScreenerResults = async (
  token: string,
  strategyId: string
): Promise<ScreenerResultRecord[]> => {
  const response = await requestJson<{ results?: Array<Record<string, unknown>> }>(
    `/strategies/${strategyId}/screener/results`,
    token
  );
  return Array.isArray(response.results)
    ? response.results.map((entry) => mapScreenerResultRecord(entry))
    : [];
};

export const fetchScreenerResult = async (
  token: string,
  strategyId: string,
  runId: string
): Promise<ScreenerResultRecord | null> => {
  const response = await requestJson<{ result?: Record<string, unknown> | null }>(
    `/strategies/${strategyId}/screener/results/${runId}`,
    token
  );
  if (response.result && typeof response.result === 'object') {
    return mapScreenerResultRecord(response.result);
  }
  return null;
};

export const runScreenerRequest = async (
  token: string,
  strategyId: string
): Promise<Record<string, unknown> | null> => {
  const response = await requestJson<{ run?: Record<string, unknown> | null }>(
    `/strategies/${strategyId}/run`,
    token,
    { method: 'POST' }
  );
  return response.run ?? null;
};
