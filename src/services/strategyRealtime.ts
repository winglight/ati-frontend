import type { AppDispatch, RootState } from '@store/index';
import {
  setStrategyFallbackMode,
  setStrategyMetrics,
  setStrategyPerformance,
  updateStrategyStatus,
  setStrategyRuntimeSnapshot,
  setMarketDataSubscriptions,
  setMarketDataSubscriptionsStatus
} from '@store/slices/strategiesSlice';
import { logout } from '@store/slices/authSlice';
import type {
  StrategyItem,
  StrategyParameterConfig,
  StrategyParameterOption,
  StrategyScheduleWindow,
  StrategyRuntimeSnapshotData
} from '@features/dashboard/types';
import {
  getStrategyCandlesSnapshot,
  listStrategiesMapped,
  mapStrategyRecord,
  mapStrategyMetrics,
  mapStrategyPerformance,
  mapRuntimeSnapshot,
  type StrategyRecordPayload,
  type StrategyMetricsResponse
} from './strategyApi';
import type {
  ActiveSubscriptionSummaryPayload,
  MarketSubscriptionStreamPayload,
  MarketSubscriptionStreamSubscriberPayload,
  StrategyMarketDataEventPayload
} from './marketApi';
import {
  isAuthenticationFailureCloseEvent,
  subscribeWebSocket,
  type WebSocketSubscription
} from './websocketHub';
import { normalizeTimestampToUtc } from '../utils/timezone.js';
import { isScreenerStrategy } from '@features/strategies/utils/strategyKind';

interface StrategyRealtimeClientOptions {
  dispatch: AppDispatch;
  tokenProvider: () => string | null;
  stateProvider: () => RootState;
  pollIntervalMs?: number;
  forceHttpPolling?: boolean;
  dependencies?: Partial<StrategyRealtimeClientDependencies>;
}

interface StrategyRealtimeClientDependencies {
  subscribeWebSocket: typeof subscribeWebSocket;
  listStrategiesMapped: typeof listStrategiesMapped;
  getStrategyCandlesSnapshot: typeof getStrategyCandlesSnapshot;
  getStrategyPerformanceSummary?: (...args: unknown[]) => Promise<unknown>;
  getStrategyMetricsSnapshot?: (...args: unknown[]) => Promise<unknown>;
}

interface WebSocketEnvelope {
  type?: string;
  event?: string;
  payload?: unknown;
  timestamp?: string;
  topics?: string[];
  action?: string;
}

interface StrategyStatusEventPayload {
  strategy_id?: string | number;
  id?: number | string;
  name?: string;
  title?: string;
  description?: string | null;
  enabled?: boolean;
  active?: boolean;
  state?: string | null;
  mode?: string | null;
  symbol?: string | null;
  instrument?: string | null;
  strategy_type?: string | null;
  template?: string | null;
  last_signal?: string | null;
  lastSignal?: string | null;
  windows?: Array<Record<string, unknown>> | null;
  parameters?: Array<Record<string, unknown>> | null;
  skip_weekends?: boolean | null;
  metrics?: Record<string, unknown> | null;
  metrics_updated_at?: string | null;
  updated_at?: string | null;
  return_rate?: number | string | null;
  performance?: Record<string, unknown> | null;
}

interface StrategyMetricEventPayload {
  id?: string | number;
  strategy_id?: string | number;
  metrics?: Record<string, unknown> | null;
  period?: string | null;
  updated_at?: string | null;
  last_updated_at?: string | null;
  summary?: Record<string, unknown> | null;
  realtime?: Record<string, unknown> | null;
  performance?: Record<string, unknown> | null;
}

const normalizeIdentifier = (
  ...candidates: Array<string | number | null | undefined>
): string | null => {
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

// Narrow unknown values into acceptable identifier candidate types
const toIdCandidate = (value: unknown): string | number | null | undefined => {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed || null;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  return value == null ? null : undefined;
};

const DEFAULT_POLL_INTERVAL = 20000;

const timerHost: Pick<typeof globalThis, 'setInterval' | 'clearInterval' | 'setTimeout' | 'clearTimeout'> =
  typeof window !== 'undefined' ? window : globalThis;


export class StrategyRealtimeClient {
  private readonly dispatch: AppDispatch;
  private readonly tokenProvider: () => string | null;
  private readonly stateProvider: () => RootState;
  private readonly pollIntervalMs: number;
  private readonly forceHttpPolling: boolean;
  private readonly dependencies: StrategyRealtimeClientDependencies;
  private socketHandle: WebSocketSubscription | null = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private pollingPromise: Promise<void> | null = null;
  private started = false;
  private subscriptionsAccumulator = new Map<string, ActiveSubscriptionSummaryPayload>();
  private subscriptionsCoalesceTimer: ReturnType<typeof setTimeout> | null = null;
  private subscriptionsEmptyClearTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly EMPTY_CLEAR_DELAY_MS = 1200;
  private readonly COALESCE_DELAY_MS = 180;

  constructor(options: StrategyRealtimeClientOptions) {
    this.dispatch = options.dispatch;
    this.tokenProvider = options.tokenProvider;
    this.stateProvider = options.stateProvider;
    this.pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL;
    this.forceHttpPolling = options.forceHttpPolling ?? false;
    const defaultDependencies: StrategyRealtimeClientDependencies = {
      subscribeWebSocket,
      listStrategiesMapped: (token: string) => listStrategiesMapped(token, { refresh: true, period: 'day' }),
      getStrategyCandlesSnapshot
    };
    this.dependencies = { ...defaultDependencies, ...options.dependencies };
  }

  async connect() {
    if (this.started) {
      return;
    }
    this.started = true;
    if (this.forceHttpPolling) {
      this.dispatch(setStrategyFallbackMode('http-polling'));
      // // Polling disabled
      // this.startPolling();
    } else {
      this.openSocket();
    }
  }

  async disconnect() {
    this.started = false;
    this.stopPolling();
    this.socketHandle?.dispose();
    this.socketHandle = null;
  }

  private openSocket() {
    const token = this.tokenProvider();
    if (!token) {
      this.dispatch(setStrategyFallbackMode('http-polling'));
      // this.startPolling();
      return;
    }
    this.socketHandle?.dispose();
    this.socketHandle = this.dependencies.subscribeWebSocket({
      name: 'ws',
      tokenProvider: this.tokenProvider,
      onOpen: () => {
        this.dispatch(setStrategyFallbackMode('websocket'));
        this.stopPolling();
        this.send({
          action: 'subscribe',
          topics: [
            'strategy.status',
            'strategy.metric',
            'strategy.market_data'
          ]
        });
      },
      onMessage: (data) => {
        this.handleMessage(data);
      },
      onError: () => {
        this.dispatch(setStrategyFallbackMode('http-polling'));
      },
      onClose: (event) => {
        if (isAuthenticationFailureCloseEvent(event)) {
          this.dispatch(logout());
          return;
        }
        this.dispatch(setStrategyFallbackMode('http-polling'));
        if (this.started) {
          // this.startPolling();
        }
      }
    });
  }

  private handleMessage(raw: string) {
    try {
      const payload: WebSocketEnvelope = JSON.parse(raw);
      if (payload.type === 'event' && payload.event) {
        this.handleEvent(payload.event, payload.payload, payload.timestamp);
      }
    } catch (error) {
      console.warn('无法解析策略推送：', raw, error);
    }
  }

  private handleEvent(event: string, payload: unknown, timestamp?: string) {
    if (event === 'strategy.status') {
      this.handleStatus(payload as StrategyStatusEventPayload | undefined);
      return;
    }
    if (event === 'strategy.metric') {
      this.handleMetric(payload as StrategyMetricEventPayload | undefined);
      return;
    }
    if (event === 'strategy.market_data') {
      this.handleMarketData(payload, timestamp);
      return;
    }
  }

  private handleStatus(payload: StrategyStatusEventPayload | undefined) {
    if (!payload) {
      return;
    }
    const incomingId = normalizeIdentifier(payload.id);
    const legacyId = normalizeIdentifier(payload.strategy_id);
    const incomingMetricsUpdatedAtRaw =
      typeof payload.metrics_updated_at === 'string' && payload.metrics_updated_at.trim()
        ? payload.metrics_updated_at
        : null;
    const hasIncomingMetricsPayload = Boolean(payload.metrics && typeof payload.metrics === 'object');
    const explicitName =
      typeof payload.name === 'string' && payload.name.trim()
        ? payload.name.trim()
        : null;
    const state = this.stateProvider();
    const existingByIncomingId = incomingId
      ? state.strategies.items.find((item) => item.id === incomingId)
      : undefined;
    const existingByLegacy = legacyId
      ? state.strategies.items.find((item) => item.id === legacyId)
      : undefined;
    const existingByName = explicitName
      ? state.strategies.items.find(
          (item) => item.id === explicitName || item.name === explicitName
        )
      : undefined;
    const existing = existingByIncomingId ?? existingByLegacy ?? existingByName;
    const id = incomingId ?? legacyId ?? existing?.id ?? explicitName;
    if (!id) {
      return;
    }

    const fallbackWindows =
      existing?.schedule?.windows?.map((window: StrategyScheduleWindow) => ({
        start: window.start,
        end: window.end
      })) ?? null;
    const windows = Array.isArray(payload.windows) ? payload.windows : fallbackWindows;

    const fallbackParameters =
      existing?.parameters?.map((parameter: StrategyParameterConfig) => ({
        name: parameter.name,
        label: parameter.label,
        value: parameter.value,
        type: parameter.type,
        description: parameter.description,
        default: parameter.defaultValue,
        options: (() => {
          const optionEntries = parameter.options ?? null;
          if (optionEntries && optionEntries.length > 0) {
            return optionEntries.map((option: StrategyParameterOption) => ({
              value: option.value,
              label: option.label
            }));
          }
          return null;
        })(),
        min: parameter.min,
        max: parameter.max,
        step: parameter.step
      })) ?? null;
    const parameters = Array.isArray(payload.parameters) ? payload.parameters : fallbackParameters;

    const record: StrategyRecordPayload = {
      id: incomingId ?? legacyId ?? id,
      strategy_id: legacyId ?? null,
      name: explicitName ?? existing?.name ?? id,
      title:
        typeof payload.title === 'string' && payload.title.trim()
          ? payload.title.trim()
          : existing?.name ?? explicitName ?? id,
      description:
        typeof payload.description === 'string'
          ? payload.description
          : existing?.description ?? null,
      enabled:
        typeof payload.enabled === 'boolean'
          ? payload.enabled
          : existing?.enabled ?? true,
      active:
        typeof payload.active === 'boolean'
          ? payload.active
          : existing?.active ?? false,
      skip_weekends:
        typeof payload.skip_weekends === 'boolean'
          ? payload.skip_weekends
          : existing?.schedule?.skipWeekends ?? null,
      windows: windows as Array<Record<string, unknown>> | null,
      parameters: parameters as Array<Record<string, unknown>> | null,
      state: typeof payload.state === 'string' ? payload.state : null,
      mode: typeof payload.mode === 'string' ? payload.mode : existing?.mode ?? null,
      strategy_type:
        typeof payload.strategy_type === 'string'
          ? payload.strategy_type
          : existing?.templateId ?? null,
      template: typeof payload.template === 'string' ? payload.template : null,
      last_signal:
        typeof payload.last_signal === 'string'
          ? payload.last_signal
          : typeof payload.lastSignal === 'string'
            ? payload.lastSignal
            : existing?.lastSignal ?? null,
      symbol:
        typeof payload.symbol === 'string'
          ? payload.symbol
          : existing?.symbol ?? null,
      instrument: typeof payload.instrument === 'string' ? payload.instrument : null,
      updated_at:
        typeof payload.updated_at === 'string'
          ? payload.updated_at
          : existing?.lastUpdatedAt ?? new Date().toISOString(),
      metrics:
        hasIncomingMetricsPayload
          ? (payload.metrics as Record<string, unknown>)
          : existing?.metricsSnapshot?.metrics ?? null,
      metrics_updated_at:
        hasIncomingMetricsPayload
          ? incomingMetricsUpdatedAtRaw
          : existing?.metricsSnapshot?.updatedAt ?? null
    };

    const mapped = mapStrategyRecord(record);
    const returnRateCandidate =
      typeof payload.return_rate === 'number'
        ? payload.return_rate
        : typeof payload.return_rate === 'string'
          ? Number(payload.return_rate)
          : null;
    if (returnRateCandidate !== null && Number.isFinite(returnRateCandidate)) {
      mapped.returnRate = Number(returnRateCandidate);
    } else if (typeof payload.performance === 'object' && payload.performance) {
      const performanceReturn = (payload.performance as Record<string, unknown>).return_rate;
      if (typeof performanceReturn === 'number' && Number.isFinite(performanceReturn)) {
        mapped.returnRate = performanceReturn;
      }
    }

    const { id: mappedId, ...rest } = mapped;
    const targetId = mappedId || id;
    const updates: Partial<StrategyItem> = { ...rest };
    const hasPerformancePayload =
      payload.performance && typeof payload.performance === 'object';
    if (!hasPerformancePayload) {
      delete updates.performanceSnapshot;
    }
    const hasMetricsPayload = payload.metrics && typeof payload.metrics === 'object';
    if (!hasMetricsPayload) {
      delete updates.metricsSnapshot;
    }
    this.dispatch(updateStrategyStatus({ id: targetId, changes: updates }));
    if (mapped.metricsSnapshot) {
      this.dispatch(setStrategyMetrics({ id: targetId, metrics: mapped.metricsSnapshot }));
    }
    const performancePayload = payload.performance;
    if (performancePayload && typeof performancePayload === 'object') {
      const performanceRecord = performancePayload as Record<string, unknown>;
      const period =
        typeof performanceRecord.period === 'string' && performanceRecord.period.trim()
          ? performanceRecord.period.trim()
          : 'day';
      const summaryCandidate = performanceRecord.summary;
      const summary =
        summaryCandidate && typeof summaryCandidate === 'object'
          ? (summaryCandidate as Record<string, unknown>)
          : Object.fromEntries(
              Object.entries(performanceRecord).filter(([key]) => key !== 'period')
            );
      const performance = mapStrategyPerformance(
        targetId,
        { summary } as Parameters<typeof mapStrategyPerformance>[1],
        period
      );
      this.dispatch(setStrategyPerformance({ id: targetId, performance, period }));
    }
  }

  private handleMarketData(payload: unknown, timestamp?: string) {
    const streamingEnabled =
      this.stateProvider().strategies.marketDataSubscriptions.streamingEnabled !== false;
    if (!streamingEnabled) {
      return;
    }
    const normalized = this.normalizeMarketDataEvent(payload);
    if (!normalized) {
      const errorMessage = '收到无效的策略行情订阅推送';
      console.warn(errorMessage, payload);
      this.dispatch(
        setMarketDataSubscriptionsStatus({ status: 'idle', error: errorMessage })
      );
      // 保持已有订阅列表不变，只更新时间戳与错误，避免 UI 列表闪烁被清空
      this.dispatch(
        setMarketDataSubscriptions({
          updatedAt: timestamp ?? null,
          error: errorMessage
        })
      );
      return;
    }
    const updatedAt = normalized.updatedAt ?? timestamp ?? null;
    const telemetry = normalized.telemetry;
    const statusPayload: Parameters<typeof setMarketDataSubscriptionsStatus>[0] = {
      status: normalized.status
    };
    if (normalized.error !== undefined) {
      statusPayload.error = normalized.error;
    }
    this.dispatch(setMarketDataSubscriptionsStatus(statusPayload));

    if (normalized.items === undefined) {
      const updatePayload: Parameters<typeof setMarketDataSubscriptions>[0] = {
        updatedAt,
        telemetry
      };
      if (normalized.error !== undefined) {
        updatePayload.error = normalized.error;
      }
      this.dispatch(setMarketDataSubscriptions(updatePayload));
      return;
    }

    if (normalized.items.length === 0) {
      if (this.subscriptionsCoalesceTimer) {
        clearTimeout(this.subscriptionsCoalesceTimer);
        this.subscriptionsCoalesceTimer = null;
      }
      if (this.subscriptionsEmptyClearTimer) {
        clearTimeout(this.subscriptionsEmptyClearTimer);
      }
      this.subscriptionsEmptyClearTimer = setTimeout(() => {
        this.subscriptionsEmptyClearTimer = null;
        if (!this.subscriptionsCoalesceTimer) {
          this.subscriptionsAccumulator.clear();
          this.dispatch(
            setMarketDataSubscriptions({
              items: [],
              updatedAt,
              telemetry,
              error: normalized.error ?? null
            })
          );
        }
      }, this.EMPTY_CLEAR_DELAY_MS);
      const updatePayload: Parameters<typeof setMarketDataSubscriptions>[0] = {
        updatedAt,
        telemetry
      };
      if (normalized.error !== undefined) {
        updatePayload.error = normalized.error;
      }
      this.dispatch(setMarketDataSubscriptions(updatePayload));
      return;
    }

    if (this.subscriptionsEmptyClearTimer) {
      clearTimeout(this.subscriptionsEmptyClearTimer);
      this.subscriptionsEmptyClearTimer = null;
    }

    for (const item of normalized.items) {
      const key = item.subscriptionId;
      const existing = this.subscriptionsAccumulator.get(key);
      if (!existing) {
        this.subscriptionsAccumulator.set(key, item);
      } else {
        const merged: ActiveSubscriptionSummaryPayload = { ...existing, ...item };
        const collectStreams = [
          ...(existing.streams ?? []),
          ...(item.streams ?? [])
        ];
        const byType = new Map<string, MarketSubscriptionStreamPayload>();
        for (const st of collectStreams) {
          const typeKey = `${st.streamType}:${st.requestId ?? ''}`;
          const prev = byType.get(typeKey);
          if (!prev) {
            byType.set(typeKey, { ...st, subscribers: [...st.subscribers] });
          } else {
            const enabled = prev.enabled || st.enabled;
            const ownerCount = Math.max(prev.ownerCount ?? 0, st.ownerCount ?? 0);
            const uniq = new Map<string, MarketSubscriptionStreamSubscriberPayload>();
            for (const s of [...prev.subscribers, ...st.subscribers]) {
              const k = `${s.stream}|${s.ownerId}|${s.source ?? ''}`;
              if (!uniq.has(k)) uniq.set(k, s);
            }
            byType.set(typeKey, {
              ...prev,
              enabled,
              ownerCount,
              subscribers: Array.from(uniq.values())
            });
          }
        }
        merged.streams = Array.from(byType.values());
        this.subscriptionsAccumulator.set(key, merged);
      }
    }

    if (this.subscriptionsCoalesceTimer) {
      clearTimeout(this.subscriptionsCoalesceTimer);
    }
    this.dispatch(
      setMarketDataSubscriptions({
        items: normalized.items,
        updatedAt,
        telemetry,
        error: normalized.error ?? null
      })
    );
    this.subscriptionsCoalesceTimer = setTimeout(() => {
      this.subscriptionsCoalesceTimer = null;
      const list = Array.from(this.subscriptionsAccumulator.values());
      list.sort((a, b) => {
        const sym = (a.symbol ?? '').localeCompare(b.symbol ?? '');
        if (sym !== 0) return sym;
        return a.subscriptionId.localeCompare(b.subscriptionId);
      });
      const updatePayload: Parameters<typeof setMarketDataSubscriptions>[0] = {
        items: list,
        updatedAt,
        telemetry
      };
      if (normalized.error !== undefined) {
        updatePayload.error = normalized.error;
      }
      this.dispatch(setMarketDataSubscriptions(updatePayload));
      this.subscriptionsAccumulator.clear();
    }, this.COALESCE_DELAY_MS);

    const trailingPayload: Parameters<typeof setMarketDataSubscriptions>[0] = {
      updatedAt,
      telemetry
    };
    if (normalized.error !== undefined) {
      trailingPayload.error = normalized.error;
    }
    this.dispatch(setMarketDataSubscriptions(trailingPayload));

    if (telemetry && typeof telemetry === 'object') {
      this.handleTelemetrySnapshot(telemetry as Record<string, unknown>, updatedAt);
    }
  }

  private handleTelemetrySnapshot(
    telemetry: Record<string, unknown>,
    updatedAt: string | null
  ) {
    for (const [key, value] of Object.entries(telemetry)) {
      if (!value || typeof value !== 'object') {
        continue;
      }
      const record = value as Record<string, unknown>;
      const hasTelemetryFields = [
        'summary',
        'data_push',
        'stop_levels',
        'logs',
        'phases',
        'phase_states',
        'subscriptions',
        'signals',
        'processing_log'
      ].some((field) => Object.prototype.hasOwnProperty.call(record, field));
      if (!hasTelemetryFields) {
        continue;
      }
      const id = normalizeIdentifier(key, toIdCandidate(record['strategy_id']), toIdCandidate(record['id']));
      if (!id) {
        continue;
      }
      const withTimestamp =
        updatedAt &&
        !Object.prototype.hasOwnProperty.call(record, 'refreshed_at') &&
        !Object.prototype.hasOwnProperty.call(record, 'updated_at')
          ? { ...record, refreshed_at: updatedAt }
          : record;
      const snapshot = mapRuntimeSnapshot(withTimestamp);
      if (updatedAt && !snapshot.refreshedAt) {
        snapshot.refreshedAt = updatedAt;
      }
      this.dispatch(setStrategyRuntimeSnapshot({ id, snapshot }));
    }
  }

  private normalizeMarketDataEvent(
    payload: unknown
  ): {
    items?: ActiveSubscriptionSummaryPayload[];
    telemetry?: Record<string, unknown>;
    updatedAt?: string | null;
    status: 'idle' | 'updating';
    error?: string | null;
  } | null {
    if (!payload || typeof payload !== 'object') {
      return null;
    }
    const record = payload as StrategyMarketDataEventPayload & Record<string, unknown>;
    const rawSubscriptions = (record as Record<string, unknown>).subscriptions ?? (record as Record<string, unknown>).items;
    let items: ActiveSubscriptionSummaryPayload[] | undefined;
    if (Array.isArray(rawSubscriptions)) {
      items = rawSubscriptions
        .map((entry) => this.normalizeMarketDataSubscription(entry))
        .filter(
          (entry): entry is ActiveSubscriptionSummaryPayload => entry !== null
        );
    } else if (rawSubscriptions === null) {
      // 明确的空列表信号：保留为空数组
      items = [];
    } else {
      // 未提供 subscriptions 字段：不要更新 items，保持现有订阅列表稳定
      items = undefined;
    }
    const telemetryCandidate = record.telemetry;
    const telemetry =
      telemetryCandidate &&
      typeof telemetryCandidate === 'object' &&
      !Array.isArray(telemetryCandidate)
        ? (telemetryCandidate as Record<string, unknown>)
        : undefined;
    const updatedRaw =
      (record as Record<string, unknown>)['updated_at'] ??
      record.updated_at ??
      record.updatedAt;
    let updatedAt: string | null | undefined;
    if (typeof updatedRaw === 'string') {
      updatedAt = updatedRaw;
    } else if (updatedRaw === null) {
      updatedAt = null;
    }
    const statusCandidate = record.status;
    const status: 'idle' | 'updating' =
      statusCandidate === 'updating' ? 'updating' : 'idle';
    const { provided: hasError, value: errorMessage } = this.extractMarketDataError(record);
    const result: {
      items?: ActiveSubscriptionSummaryPayload[];
      telemetry?: Record<string, unknown>;
      updatedAt?: string | null;
      status: 'idle' | 'updating';
      error?: string | null;
    } = { items, telemetry, updatedAt, status };
    if (hasError) {
      result.error = errorMessage;
    }
    return result;
  }

  private normalizeMarketDataSubscription(
    value: unknown
  ): ActiveSubscriptionSummaryPayload | null {
    if (!value || typeof value !== 'object') {
      return null;
    }
    const record = value as Record<string, unknown>;
    const subscriptionId = this.pickIdentifier(
      record,
      'subscriptionId',
      'subscription_id',
      'id'
    );
    if (!subscriptionId) {
      return null;
    }
    const symbolText = this.pickText(record, 'symbol');
    const symbol =
      typeof symbolText === 'string' && symbolText.trim()
        ? symbolText
        : subscriptionId;
    const result: ActiveSubscriptionSummaryPayload = {
      subscriptionId,
      symbol,
      streams: []
    };
    const secType = this.pickText(record, 'secType', 'sec_type');
    if (secType !== undefined) {
      result.secType = secType;
    }
    const exchange = this.pickText(record, 'exchange');
    if (exchange !== undefined) {
      result.exchange = exchange;
    }
    const currency = this.pickText(record, 'currency');
    if (currency !== undefined) {
      result.currency = currency;
    }
    const localSymbol = this.pickText(record, 'localSymbol', 'local_symbol');
    if (localSymbol !== undefined) {
      result.localSymbol = localSymbol;
    }
    const timeframe = this.pickText(record, 'timeframe');
    if (timeframe !== undefined) {
      result.timeframe = timeframe;
    }
    const enableDom = this.pickBoolean(record, 'enableDom', 'enable_dom');
    if (enableDom !== undefined) {
      result.enableDom = enableDom;
    }
    const enableTicker = this.pickBoolean(
      record,
      'enableTicker',
      'enable_ticker'
    );
    if (enableTicker !== undefined) {
      result.enableTicker = enableTicker;
    }
    const enableBars = this.pickBoolean(record, 'enableBars', 'enable_bars');
    if (enableBars !== undefined) {
      result.enableBars = enableBars;
    }
    const startedAt = this.pickText(record, 'startedAt', 'started_at');
    if (startedAt !== undefined) {
      result.startedAt = startedAt;
    }
    const ownerCountRaw = record['ownerCount'] ?? record['owner_count'];
    if (typeof ownerCountRaw === 'number' && Number.isFinite(ownerCountRaw)) {
      result.ownerCount = ownerCountRaw;
    } else if (typeof ownerCountRaw === 'string') {
      const parsed = Number(ownerCountRaw);
      if (!Number.isNaN(parsed)) {
        result.ownerCount = parsed;
      }
    } else if (ownerCountRaw === null) {
      result.ownerCount = null;
    }
    const ownersRaw = record['owners'];
    if (Array.isArray(ownersRaw)) {
      const owners = ownersRaw
        .map((owner) => {
          if (typeof owner === 'string') {
            const trimmed = owner.trim();
            return trimmed || null;
          }
          if (typeof owner === 'number' && Number.isFinite(owner)) {
            return String(owner);
          }
          return null;
        })
        .filter((owner): owner is string => Boolean(owner));
      result.owners = owners.length > 0 ? owners : [];
    } else if (ownersRaw === null) {
      result.owners = null;
    }
    const metadataRaw = record['metadata'];
    if (
      metadataRaw &&
      typeof metadataRaw === 'object' &&
      !Array.isArray(metadataRaw)
    ) {
      result.metadata = metadataRaw as Record<string, unknown>;
    } else if (metadataRaw === null) {
      result.metadata = null;
    }
    const streams = this.normalizeSubscriptionStreams(record, subscriptionId);
    result.streams = streams;
    const streamOwners = new Set<string>();
    for (const stream of streams) {
      for (const subscriber of stream.subscribers) {
        streamOwners.add(subscriber.ownerId);
      }
    }
    if (result.owners === undefined) {
      result.owners = streamOwners.size > 0 ? Array.from(streamOwners) : [];
    }
    if (result.ownerCount === undefined) {
      result.ownerCount = streamOwners.size;
    }
    if (result.enableDom === undefined) {
      result.enableDom = streams.some(
        (stream) =>
          stream.streamType === 'dom' && (stream.enabled || stream.ownerCount > 0)
      );
    }
    if (result.enableTicker === undefined) {
      result.enableTicker = streams.some(
        (stream) =>
          stream.streamType === 'ticker' && (stream.enabled || stream.ownerCount > 0)
      );
    }
    if (result.enableBars === undefined) {
      result.enableBars = streams.some(
        (stream) =>
          stream.streamType === 'bars' && (stream.enabled || stream.ownerCount > 0)
      );
    }
    return result;
  }

  private extractMarketDataError(
    payload: StrategyMarketDataEventPayload & Record<string, unknown>
  ): { provided: boolean; value: string | null } {
    if (Object.prototype.hasOwnProperty.call(payload, 'error')) {
      const errorCandidate = payload.error;
      if (typeof errorCandidate === 'string') {
        const trimmed = errorCandidate.trim();
        return { provided: true, value: trimmed || null };
      }
      if (errorCandidate === null) {
        return { provided: true, value: null };
      }
      return { provided: true, value: null };
    }
    if (Object.prototype.hasOwnProperty.call(payload, 'message')) {
      const messageCandidate = payload.message;
      if (typeof messageCandidate === 'string') {
        const trimmed = messageCandidate.trim();
        return { provided: true, value: trimmed || null };
      }
      if (messageCandidate === null) {
        return { provided: true, value: null };
      }
      return { provided: true, value: null };
    }
    return { provided: false, value: null };
  }

  private pickIdentifier(
    record: Record<string, unknown>,
    ...keys: string[]
  ): string | null {
    for (const key of keys) {
      const value = record[key];
      if (typeof value === 'string') {
        const trimmed = value.trim();
        if (trimmed) {
          return trimmed;
        }
      } else if (typeof value === 'number' && Number.isFinite(value)) {
        return String(value);
      }
    }
    return null;
  }

  private pickText(
    record: Record<string, unknown>,
    ...keys: string[]
  ): string | null | undefined {
    for (const key of keys) {
      if (!Object.prototype.hasOwnProperty.call(record, key)) {
        continue;
      }
      const value = record[key];
      if (typeof value === 'string') {
        const trimmed = value.trim();
        return trimmed || null;
      }
      if (value === null) {
        return null;
      }
    }
    return undefined;
  }

  private pickBoolean(
    record: Record<string, unknown>,
    ...keys: string[]
  ): boolean | null | undefined {
    for (const key of keys) {
      if (!Object.prototype.hasOwnProperty.call(record, key)) {
        continue;
      }
      const value = record[key];
      if (typeof value === 'boolean') {
        return value;
      }
      if (value === null) {
        return null;
      }
    }
    return undefined;
  }

  private normalizeStreamType(value: unknown): 'dom' | 'ticker' | 'bars' {
    if (typeof value !== 'string') {
      return 'dom';
    }
    const token = value.trim().toLowerCase();
    if (token.startsWith('bars_') || token === 'bars') {
      return 'bars';
    }
    if (token === 'ticker') {
      return token;
    }
    if (token === 'dom' || token === 'depth' || token === 'orderbook') {
      return 'dom';
    }
    return 'dom';
  }

  private normalizeSubscriberTimestamp(value: unknown): string | null {
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
  }

  private normalizeStreamSubscriber(
    value: unknown,
    streamHint?: 'dom' | 'ticker' | 'bars'
  ): MarketSubscriptionStreamSubscriberPayload | null {
    if (!value || typeof value !== 'object') {
      return null;
    }
    const record = value as Record<string, unknown>;
    const ownerId = this.pickIdentifier(record, 'ownerId', 'owner_id', 'owner');
    if (!ownerId) {
      return null;
    }
    const referenceRaw = record['referenceCount'] ?? record['reference_count'];
    let referenceCount: number | null = null;
    if (typeof referenceRaw === 'number' && Number.isFinite(referenceRaw)) {
      referenceCount = referenceRaw;
    } else if (typeof referenceRaw === 'string') {
      const parsed = Number(referenceRaw);
      if (!Number.isNaN(parsed)) {
        referenceCount = parsed;
      }
    } else if (referenceRaw === null) {
      referenceCount = null;
    }
    const metadataRaw = record['metadata'];
    const metadata =
      metadataRaw &&
      typeof metadataRaw === 'object' &&
      !Array.isArray(metadataRaw)
        ? (metadataRaw as Record<string, unknown>)
        : undefined;
    const sourceCandidate = this.pickText(record, 'source');
    let source = sourceCandidate ?? undefined;
    if (!source && metadata && typeof metadata['source'] === 'string') {
      const metadataSource = metadata['source'].trim();
      if (metadataSource) {
        source = metadataSource;
      }
    }
    const nameCandidate = this.pickText(record, 'name');
    const subscribedAtRaw = record['subscribedAt'] ?? record['subscribed_at'];
    const subscribedAt = this.normalizeSubscriberTimestamp(subscribedAtRaw);
    const pushedAtRaw = record['pushedAt'] ?? record['pushed_at'];
    const pushedAt = this.normalizeSubscriberTimestamp(pushedAtRaw);
    const featuresRaw = record['features'];
    let features: Record<string, boolean> | null | undefined;
    if (featuresRaw && typeof featuresRaw === 'object' && !Array.isArray(featuresRaw)) {
      const normalized: Record<string, boolean> = {};
      for (const [key, value] of Object.entries(featuresRaw)) {
        if (typeof key === 'string') {
          normalized[key] = Boolean(value);
        }
      }
      features = Object.keys(normalized).length > 0 ? normalized : null;
    }
    const streamToken =
      this.pickText(record, 'stream', 'streamType', 'stream_type') ??
      (metadata && typeof metadata['stream'] === 'string' ? metadata['stream'] : null);
    const normalizedStream = streamToken
      ? this.normalizeStreamType(streamToken)
      : streamHint;

    return {
      ownerId,
      referenceCount,
      metadata,
      name: nameCandidate === undefined ? undefined : nameCandidate,
      subscribedAt: subscribedAt ?? undefined,
      pushedAt: pushedAt ?? undefined,
      features: features ?? undefined,
      source,
      stream: normalizedStream ?? undefined
    };
  }

  private normalizeSubscriptionStreams(
    value: unknown,
    fallbackSubscriptionId: string
  ): MarketSubscriptionStreamPayload[] {
    if (!value || typeof value !== 'object') {
      return [];
    }
    const record = value as Record<string, unknown>;

    const parseCollection = (
      collection: unknown,
      streamType: 'dom' | 'ticker' | 'bars'
    ): MarketSubscriptionStreamSubscriberPayload[] => {
      if (!Array.isArray(collection)) {
        return [];
      }
      return collection
        .map((item) => this.normalizeStreamSubscriber(item, streamType))
        .filter(
          (item): item is MarketSubscriptionStreamSubscriberPayload => item !== null
        );
    };

    const fallbackSubscribers = (streamType: 'dom' | 'ticker' | 'bars') => {
      const aggregate = record['subscribers'];
      if (!Array.isArray(aggregate)) {
        return [];
      }
      return aggregate
        .map((item) => this.normalizeStreamSubscriber(item))
        .filter(
          (item): item is MarketSubscriptionStreamSubscriberPayload => item !== null
        )
        .filter((subscriber) => subscriber.stream === streamType);
    };

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

    const resolveStreamsFromEntries = (): MarketSubscriptionStreamPayload[] => {
      const streamsRaw = record['streams'];
      if (!Array.isArray(streamsRaw)) {
        return [];
      }
      const result: MarketSubscriptionStreamPayload[] = [];
      for (const entry of streamsRaw) {
        if (!entry || typeof entry !== 'object') {
          continue;
        }
        const streamRecord = entry as Record<string, unknown>;
        const typeToken = this.pickText(streamRecord, 'stream', 'streamType', 'stream_type');
        const streamType = this.normalizeStreamType(typeToken ?? undefined);
        const subscribers = parseCollection(streamRecord['subscribers'], streamType);
        let requestId = formatBarsRequestId(streamRecord['request_id']);
        if (!requestId) {
          requestId = parseBarsStreamToken(typeToken ?? '');
        }
        if (!requestId && streamType === 'bars') {
          requestId = toBarsRequestId(record['timeframe']);
        }
        const ownerIds = new Set(subscribers.map((subscriber) => subscriber.ownerId));
        const totalReferences = streamType === 'dom'
          ? null
          : subscribers.reduce<number | null>((sum, subscriber) => {
              if (subscriber.referenceCount == null) {
                return sum;
              }
              return (sum ?? 0) + subscriber.referenceCount;
            }, null);
        const enabledToken = streamRecord['enabled'];
        const enabled =
          typeof enabledToken === 'boolean' ? enabledToken : subscribers.length > 0 ? true : null;
        if (!enabled && ownerIds.size === 0 && subscribers.length === 0) {
          continue;
        }
        result.push({
          subscriptionId: fallbackSubscriptionId,
          streamType,
          enabled,
          ownerCount: ownerIds.size,
          totalReferences,
          metadata: undefined,
          subscribers,
          requestId: requestId ?? undefined
        });
      }
      return result;
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

    const buildStream = (
      streamType: 'dom' | 'ticker' | 'bars'
    ): MarketSubscriptionStreamPayload => {
      const direct = parseCollection(
        record[resolveSubscribersKey(streamType)],
        streamType
      );
      const subscribers =
        direct.length > 0
          ? direct
          : (() => {
              const fallback = fallbackSubscribers(streamType);
              if (fallback.length > 0) {
                return fallback;
              }
              return [];
            })();
      const ownerIds = new Set(subscribers.map((subscriber) => subscriber.ownerId));
      const totalReferences = streamType === 'dom'
        ? null
        : subscribers.reduce<number | null>((sum, subscriber) => {
            if (subscriber.referenceCount == null) {
              return sum;
            }
            return (sum ?? 0) + subscriber.referenceCount;
          }, null);
      const enabledToken = record[`enable_${streamType}`];
      const enabled = typeof enabledToken === 'boolean' ? enabledToken : subscribers.length > 0 ? true : null;
      return {
        subscriptionId: fallbackSubscriptionId,
        streamType,
        enabled,
        ownerCount: ownerIds.size,
        totalReferences,
        metadata: undefined,
        subscribers
      };
    };

    const fromEntries = resolveStreamsFromEntries();
    if (fromEntries.length > 0) {
      return fromEntries;
    }

    return (['dom', 'ticker', 'bars'] as const)
      .map((stream) => buildStream(stream))
      .filter((stream) => stream.ownerCount > 0 || stream.subscribers.length > 0);
  }

  private handleMetric(payload: StrategyMetricEventPayload | undefined) {
    if (!payload) {
      return;
    }
    const incomingId = normalizeIdentifier(payload.id);
    const legacyId = normalizeIdentifier(payload.strategy_id);
    const state = this.stateProvider();
    const existingByIncomingId = incomingId
      ? state.strategies.items.find((item) => item.id === incomingId)
      : undefined;
    const existingByLegacy = legacyId
      ? state.strategies.items.find((item) => item.id === legacyId)
      : undefined;
    const existing = existingByIncomingId ?? existingByLegacy;
    const id = incomingId ?? existing?.id ?? legacyId;
    if (!id) {
      return;
    }
    if (existing && isScreenerStrategy(existing)) {
      return;
    }
    const metricsPayload: StrategyMetricsResponse = {
      metrics: payload.metrics ?? null,
      period: payload.period ?? null,
      updated_at: payload.updated_at ?? null,
      last_updated_at: payload.last_updated_at ?? null
    };
    const metrics = mapStrategyMetrics(metricsPayload);
    if (metrics) {
      this.dispatch(setStrategyMetrics({ id, metrics }));
    }

    const realtimeCandidate =
      payload.realtime && typeof payload.realtime === 'object'
        ? (payload.realtime as Record<string, unknown>)
        : null;

    if (realtimeCandidate) {
      // 尝试更新运行时快照中的实时推送数据
      // 注意：这里利用 reducer 的合并逻辑，仅更新 data_push 字段，保留 summary 等其他字段
      // 由于类型定义要求 summary 必填，此处进行类型断言绕过检查
      this.dispatch(
        setStrategyRuntimeSnapshot({
          id,
          snapshot: {
            data_push: realtimeCandidate
          } as unknown as StrategyRuntimeSnapshotData
        })
      );
    }

    const performancePayloadRaw =
      payload.performance && typeof payload.performance === 'object'
        ? (payload.performance as Record<string, unknown>)
        : null;
    const summaryCandidate =
      payload.summary && typeof payload.summary === 'object'
        ? (payload.summary as Record<string, unknown>)
        : null;

    let summary: Record<string, unknown> | null = null;
    let period: string | null = null;
    if (performancePayloadRaw) {
      const summaryRaw = performancePayloadRaw.summary;
      summary =
        summaryRaw && typeof summaryRaw === 'object'
          ? (summaryRaw as Record<string, unknown>)
          : Object.fromEntries(
              Object.entries(performancePayloadRaw).filter(([key]) => key !== 'period')
            );
      period =
        typeof performancePayloadRaw.period === 'string'
          ? performancePayloadRaw.period
          : null;
    }
    if (!summary) {
      summary = summaryCandidate ?? realtimeCandidate ?? null;
    }
    if (summary) {
      const resolvedPeriod =
        period ??
        (typeof payload.period === 'string' && payload.period.trim()
          ? payload.period.trim()
          : 'day');
      const performance = mapStrategyPerformance(
        id,
        { summary } as Parameters<typeof mapStrategyPerformance>[1],
        resolvedPeriod
      );
      this.dispatch(setStrategyPerformance({ id, performance, period: resolvedPeriod }));
    }
  }

  private stopPolling() {
    if (this.pollTimer) {
      timerHost.clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  private send(message: Record<string, unknown>) {
    this.socketHandle?.send(message);
  }
}
