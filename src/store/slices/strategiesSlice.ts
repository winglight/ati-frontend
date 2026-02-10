import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import type {
  StrategyFallbackMode,
  StrategyFileItem,
  StrategyItem,
  StrategyMetricsSnapshot,
  StrategyPerformanceSnapshot,
  StrategyTemplateItem,
  StrategyDetailSummary,
  StrategyRiskSettings,
  StrategyRuntimeDetail,
  StrategyRuntimeSnapshotData,
  StrategyCandlesSnapshot,
  StrategyRiskLogEntry
} from '@features/dashboard/types';
import type { ActiveSubscriptionSummaryPayload } from '@services/marketApi';
import { initializeDashboard } from '@store/thunks/initializeDashboard';
import {
  loadStrategies,
  loadStrategyMetrics,

  loadStrategyTemplates,
  loadStrategyFiles,
  startStrategy,
  stopStrategy,
  resyncStrategySubscription,
  deleteStrategy,
  createStrategy,
  updateStrategy,
  loadStrategyDetail,
  loadStrategyRuntime,
  updateStrategySummarySettings,
  loadStrategyRiskSettings,
  saveStrategyRiskSettings,
  loadStrategyCandles,
  updateStrategyParameters,
  loadStrategyRiskLogs,
  loadStrategyPerformanceSummary,
  loadStrategyPerformanceOrders,
  loadStrategyPerformanceCharts,
  loadStrategyPerformanceCalendar
} from '@store/thunks/strategies';

export type RequestStatus = 'idle' | 'loading' | 'succeeded' | 'failed';
interface StrategyCandlesRequestState {
  interval: string;
  intervalSeconds?: number | null;
}

interface StrategiesState {
  items: StrategyItem[];
  status: RequestStatus;
  error?: string;
  selectedId: string | null;
  metrics: Record<string, StrategyMetricsSnapshot | null>;
  performance: Record<string, Record<string, StrategyPerformanceSnapshot | null>>;
  operations: Record<string, RequestStatus>;
  operationErrors: Record<string, string | undefined>;
  subscriptionResyncStatus: Record<string, RequestStatus>;
  subscriptionResyncError: Record<string, string | undefined>;
  fallbackMode: StrategyFallbackMode;
  templates: StrategyTemplateItem[];
  templatesStatus: RequestStatus;
  templatesError?: string;
  files: StrategyFileItem[];
  filesStatus: RequestStatus;
  filesError?: string;
  saveStatus: RequestStatus;
  saveError?: string | null;
  details: Record<string, StrategyDetailSummary | null>;
  detailStatus: Record<string, RequestStatus>;
  detailError: Record<string, string | undefined>;
  runtime: Record<string, StrategyRuntimeDetail | null>;
  runtimeStatus: Record<string, RequestStatus>;
  runtimeError: Record<string, string | undefined>;
  risk: Record<string, StrategyRiskSettings | null>;
  riskStatus: Record<string, RequestStatus>;
  riskError: Record<string, string | undefined>;
  riskLogs: Record<string, StrategyRiskLogEntry[] | null>;
  riskLogsStatus: Record<string, RequestStatus>;
  riskLogsError: Record<string, string | undefined>;
  summaryStatus: Record<string, RequestStatus>;
  summaryError: Record<string, string | undefined>;
  riskSaveStatus: Record<string, RequestStatus>;
  riskSaveError: Record<string, string | undefined>;
  candles: Record<string, StrategyCandlesSnapshot | null>;
  candlesStatus: Record<string, RequestStatus>;
  candlesError: Record<string, string | undefined>;
  candlesRequest: Record<string, StrategyCandlesRequestState | undefined>;
  parameterStatus: Record<string, RequestStatus>;
  parameterError: Record<string, string | undefined>;
  marketDataSubscriptions: {
    items: ActiveSubscriptionSummaryPayload[];
    status: 'idle' | 'updating';
    error: string | null;
    updatedAt: string | null;
    telemetry?: Record<string, unknown>;
    streamingEnabled: boolean;
  };
}

const createStrategyItem = (
  partial: Partial<StrategyItem> & { id: string }
): StrategyItem => ({
  id: partial.id,
  name: partial.name ?? partial.id,
  symbol: partial.symbol ?? '--',
  status: partial.status ?? 'stopped',
  mode: partial.mode ?? 'paper',
  returnRate: partial.returnRate ?? 0,
  lastSignal: partial.lastSignal ?? null,
  description: partial.description ?? null,
  templateId: partial.templateId ?? null,
  schedule: partial.schedule ?? null,
  parameters: partial.parameters ?? null,
  metricsSnapshot: partial.metricsSnapshot ?? null,
  performanceSnapshot: partial.performanceSnapshot ?? null,
  lastUpdatedAt: partial.lastUpdatedAt ?? null,
  enabled: typeof partial.enabled === 'boolean' ? partial.enabled : partial.status !== 'stopped',
  active: typeof partial.active === 'boolean' ? partial.active : partial.status === 'running',
  tags: partial.tags ?? null,
  dataSource: partial.dataSource ?? null,
  filePath: partial.filePath ?? null,
  strategyOrigin: partial.strategyOrigin ?? null,
  isKlineStrategy:
    typeof partial.isKlineStrategy === 'boolean' ? partial.isKlineStrategy : undefined,
  triggerCount: typeof partial.triggerCount === 'number' ? partial.triggerCount : null,
  lastTriggeredAt: partial.lastTriggeredAt ?? null,
  screenerProfile: partial.screenerProfile ?? null,
  screenerSchedule: partial.screenerSchedule ?? null
});

const toStrategyKey = (value: string | number): string =>
  typeof value === 'string' ? value : String(value);

const normalizeStrategyId = (value: string | number): string => toStrategyKey(value);

const mergeStrategyItem = (
  existing: StrategyItem | undefined,
  changes: Partial<StrategyItem> & { id: string }
): StrategyItem => {
  if (!existing) {
    return createStrategyItem(changes);
  }
  const sanitizedChanges: Partial<StrategyItem> & { id: string } = { ...changes };
  if (sanitizedChanges.isKlineStrategy === undefined) {
    delete sanitizedChanges.isKlineStrategy;
  }
  return createStrategyItem({ ...existing, ...sanitizedChanges });
};

const updateStrategyItemFromDetail = (
  state: StrategiesState,
  id: string,
  detail: StrategyDetailSummary
) => {
  const index = state.items.findIndex((strategy) => strategy.id === id);
  if (index === -1) {
    return;
  }
  state.items[index] = mergeStrategyItem(state.items[index], {
    id,
    symbol: detail.primarySymbol ?? state.items[index].symbol,
    description: detail.description ?? state.items[index].description ?? null,
    templateId: detail.strategyType ?? state.items[index].templateId ?? null,
    lastUpdatedAt: detail.updatedAt ?? state.items[index].lastUpdatedAt ?? null,
    dataSource: detail.dataSource ?? state.items[index].dataSource ?? null,
    filePath: detail.filePath ?? state.items[index].filePath ?? null,
    strategyOrigin: detail.strategyOrigin ?? state.items[index].strategyOrigin ?? null,
    schedule: detail.schedule ?? state.items[index].schedule ?? null,
    triggerCount: detail.triggerCount ?? state.items[index].triggerCount ?? null,
    lastTriggeredAt: detail.lastTriggeredAt ?? state.items[index].lastTriggeredAt ?? null,
    screenerProfile: detail.screenerProfile ?? state.items[index].screenerProfile ?? null,
    screenerSchedule: detail.screenerSchedule ?? state.items[index].screenerSchedule ?? null
  });
};

const mergeRuntimeSnapshotData = (
  current: StrategyRuntimeSnapshotData | null | undefined,
  incoming: StrategyRuntimeSnapshotData
): StrategyRuntimeSnapshotData => {
  const base: StrategyRuntimeSnapshotData = current
    ? { ...current }
    : {
      summary: {},
      refreshedAt: null
    };
  const next: StrategyRuntimeSnapshotData = { ...base, ...incoming };
  if (!Object.prototype.hasOwnProperty.call(incoming, 'summary')) {
    next.summary = base.summary;
  }
  if (!Object.prototype.hasOwnProperty.call(incoming, 'data_push')) {
    next.data_push = base.data_push;
  }
  if (!Object.prototype.hasOwnProperty.call(incoming, 'stop_levels')) {
    next.stop_levels = base.stop_levels;
  }
  if (!Object.prototype.hasOwnProperty.call(incoming, 'logs')) {
    next.logs = base.logs;
  }
  if (!Object.prototype.hasOwnProperty.call(incoming, 'refreshedAt')) {
    next.refreshedAt = base.refreshedAt;
  }
  return next;
};

const initialState: StrategiesState = {
  items: [],
  status: 'idle',
  selectedId: null,
  metrics: {},
  performance: {},
  operations: {},
  operationErrors: {},
  subscriptionResyncStatus: {},
  subscriptionResyncError: {},
  fallbackMode: 'websocket',
  templates: [],
  templatesStatus: 'idle',
  files: [],
  filesStatus: 'idle',
  saveStatus: 'idle',
  saveError: null,
  details: {},
  detailStatus: {},
  detailError: {},
  runtime: {},
  runtimeStatus: {},
  runtimeError: {},
  risk: {},
  riskStatus: {},
  riskError: {},
  riskLogs: {},
  riskLogsStatus: {},
  riskLogsError: {},
  summaryStatus: {},
  summaryError: {},
  riskSaveStatus: {},
  riskSaveError: {},
  candles: {},
  candlesStatus: {},
  candlesError: {},
  candlesRequest: {},
  parameterStatus: {},
  parameterError: {},
  marketDataSubscriptions: {
    items: [],
    status: 'idle',
    error: null,
    updatedAt: null,
    telemetry: undefined,
    streamingEnabled: true
  }
};

const strategiesSlice = createSlice({
  name: 'strategies',
  initialState,
  reducers: {
    setStrategies(state, action: PayloadAction<StrategyItem[]>) {
      state.items = action.payload.map((item) => createStrategyItem(item));
      if (state.selectedId && !state.items.some((strategy) => strategy.id === state.selectedId)) {
        state.selectedId = state.items[0]?.id ?? null;
      }
      if (!state.selectedId) {
        state.selectedId = state.items[0]?.id ?? null;
      }
    },
    upsertStrategy(state, action: PayloadAction<StrategyItem>) {
      const index = state.items.findIndex((strategy) => strategy.id === action.payload.id);
      if (index === -1) {
        state.items.push(createStrategyItem(action.payload));
        return;
      }
      state.items[index] = createStrategyItem({ ...state.items[index], ...action.payload });
    },
    updateStrategyStatus(
      state,
      action: PayloadAction<{ id: string; changes: Partial<StrategyItem> }>
    ) {
      const sanitizedChanges: Partial<StrategyItem> = { ...action.payload.changes };
      if (sanitizedChanges.performanceSnapshot === null) {
        delete sanitizedChanges.performanceSnapshot;
      }
      if (sanitizedChanges.metricsSnapshot === null) {
        delete sanitizedChanges.metricsSnapshot;
      }
      const index = state.items.findIndex((strategy) => strategy.id === action.payload.id);
      if (index === -1) {
        state.items.push(createStrategyItem({ id: action.payload.id, ...sanitizedChanges }));
        return;
      }
      state.items[index] = mergeStrategyItem(state.items[index], {
        id: action.payload.id,
        ...sanitizedChanges
      });
    },
    selectStrategy(state, action: PayloadAction<string | null>) {
      state.selectedId = action.payload;
    },
    removeStrategy(state, action: PayloadAction<string>) {
      state.items = state.items.filter((strategy) => strategy.id !== action.payload);
      delete state.metrics[action.payload];
      delete state.performance[action.payload];
      delete state.operations[action.payload];
      delete state.operationErrors[action.payload];
      delete state.subscriptionResyncStatus[action.payload];
      delete state.subscriptionResyncError[action.payload];
      delete state.details[action.payload];
      delete state.detailStatus[action.payload];
      delete state.detailError[action.payload];
      delete state.runtime[action.payload];
      delete state.runtimeStatus[action.payload];
      delete state.runtimeError[action.payload];
      delete state.risk[action.payload];
      delete state.riskStatus[action.payload];
      delete state.riskError[action.payload];
      delete state.riskLogs[action.payload];
      delete state.riskLogsStatus[action.payload];
      delete state.riskLogsError[action.payload];
      delete state.summaryStatus[action.payload];
      delete state.summaryError[action.payload];
      delete state.riskSaveStatus[action.payload];
      delete state.riskSaveError[action.payload];
      delete state.candles[action.payload];
      delete state.candlesStatus[action.payload];
      delete state.candlesError[action.payload];
      delete state.candlesRequest[action.payload];
      delete state.parameterStatus[action.payload];
      delete state.parameterError[action.payload];
      if (state.selectedId === action.payload) {
        state.selectedId = state.items[0]?.id ?? null;
      }
    },
    setStrategyCandles(
      state,
      action: PayloadAction<{
        id: string;
        candles: StrategyCandlesSnapshot | null;
        request?: StrategyCandlesRequestState | null;
      }>
    ) {
      state.candles[action.payload.id] = action.payload.candles ?? null;
      state.candlesStatus[action.payload.id] = 'succeeded';
      state.candlesError[action.payload.id] = undefined;
      if (action.payload.request) {
        state.candlesRequest[action.payload.id] = action.payload.request;
      } else if (action.payload.candles) {
        const existing = state.candlesRequest[action.payload.id];
        state.candlesRequest[action.payload.id] = {
          interval: action.payload.candles.interval ?? existing?.interval ?? '5m',
          intervalSeconds:
            action.payload.candles.intervalSeconds ?? existing?.intervalSeconds ?? null
        };
      }
    },
    setStrategyMetrics(
      state,
      action: PayloadAction<{ id: string; metrics: StrategyMetricsSnapshot | null }>
    ) {
      const existing = state.metrics[action.payload.id];
      const incoming = action.payload.metrics;

      if (incoming === null) {
        state.metrics[action.payload.id] = null;
      } else if (existing) {
        state.metrics[action.payload.id] = { ...existing, ...incoming };
      } else {
        state.metrics[action.payload.id] = incoming;
      }

      const index = state.items.findIndex((strategy) => strategy.id === action.payload.id);
      if (index !== -1) {
        state.items[index] = mergeStrategyItem(state.items[index], {
          id: action.payload.id,
          metricsSnapshot: state.metrics[action.payload.id]
        });
      }
    },
    setStrategyPerformance(
      state,
      action: PayloadAction<{
        id: string;
        performance: StrategyPerformanceSnapshot | null;
        period?: string;
      }>
    ) {
      const period = action.payload.period ?? action.payload.performance?.period ?? 'day';
      if (!state.performance[action.payload.id]) {
        state.performance[action.payload.id] = {};
      }
      const existing = state.performance[action.payload.id][period];
      const incoming = action.payload.performance;
      
      if (incoming === null) {
        state.performance[action.payload.id][period] = null;
      } else if (existing) {
        const merged = { ...existing, ...incoming };
        
        // 如果推送过来的订单列表为空，但本地已有数据，则保留本地数据（避免实时推送覆盖历史分页数据）
        if (
          incoming.orders &&
          Array.isArray(incoming.orders) &&
          incoming.orders.length === 0 &&
          existing.orders &&
          existing.orders.length > 0
        ) {
          merged.orders = existing.orders;
          merged.totalOrders = existing.totalOrders;
          merged.page = existing.page;
          merged.pageSize = existing.pageSize;
          merged.hasNext = existing.hasNext;
        }
        
        state.performance[action.payload.id][period] = merged;
      } else {
        state.performance[action.payload.id][period] = incoming;
      }
      
      const index = state.items.findIndex((strategy) => strategy.id === action.payload.id);
      if (index !== -1) {
        state.items[index] = mergeStrategyItem(state.items[index], {
          id: action.payload.id,
          performanceSnapshot: action.payload.performance ?? null
        });
      }
    },
    setStrategyFallbackMode(state, action: PayloadAction<StrategyFallbackMode>) {
      state.fallbackMode = action.payload;
    },
    setStrategyRuntimeSnapshot(
      state,
      action: PayloadAction<{ id: string; snapshot: StrategyRuntimeSnapshotData }>
    ) {
      const { id, snapshot } = action.payload;
      const existing = state.runtime[id] ?? null;
      const mergedSnapshot = mergeRuntimeSnapshotData(existing?.snapshot, snapshot);
      const runtime: StrategyRuntimeDetail = existing
        ? { ...existing, snapshot: mergedSnapshot }
        : {
            strategyId: id,
            status: { active: false, enabled: false },
            snapshot: mergedSnapshot
          };
      state.runtime[id] = runtime;
      state.runtimeStatus[id] = 'succeeded';
      state.runtimeError[id] = undefined;
    },
    setMarketDataSubscriptions(
      state,
      action: PayloadAction<{
        items?: ActiveSubscriptionSummaryPayload[];
        updatedAt?: string | null;
        telemetry?: Record<string, unknown>;
        error?: string | null;
      }>
    ) {
      if (action.payload.items !== undefined) {
        state.marketDataSubscriptions.items = action.payload.items;
      }
      if (action.payload.updatedAt !== undefined) {
        state.marketDataSubscriptions.updatedAt = action.payload.updatedAt;
      }
      if (action.payload.telemetry !== undefined) {
        state.marketDataSubscriptions.telemetry = action.payload.telemetry;
      }
      if (action.payload.error !== undefined) {
        state.marketDataSubscriptions.error = action.payload.error;
      }
    },
    setMarketDataSubscriptionsStatus(
      state,
      action: PayloadAction<{ status: 'idle' | 'updating'; error?: string | null }>
    ) {
      state.marketDataSubscriptions.status = action.payload.status;
      if (action.payload.error !== undefined) {
        state.marketDataSubscriptions.error = action.payload.error;
      }
    },
    setMarketDataSubscriptionsStreamingEnabled(state, action: PayloadAction<boolean>) {
      state.marketDataSubscriptions.streamingEnabled = action.payload;
    },
    setStrategyOperationStatus(
      state,
      action: PayloadAction<{ id: string; status: RequestStatus }>
    ) {
      state.operations[action.payload.id] = action.payload.status;
    },
    resetStrategySave(state) {
      state.saveStatus = 'idle';
      state.saveError = null;
      delete state.operations.__create__;
    },
    
  },
  extraReducers: (builder) => {
    builder
      .addCase(initializeDashboard.pending, (state) => {
        state.status = 'loading';
        state.error = undefined;
      })
      .addCase(initializeDashboard.fulfilled, (state, action) => {
        state.status = 'succeeded';
        state.items = action.payload.snapshot.strategies.map((item) => createStrategyItem(item));
        if (!state.selectedId && state.items.length > 0) {
          state.selectedId = state.items[0].id;
        }
      })
      .addCase(initializeDashboard.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.error.message;
      })
      .addCase(loadStrategies.pending, (state) => {
        state.status = 'loading';
        state.error = undefined;
      })
      .addCase(loadStrategies.fulfilled, (state, action) => {
        state.status = 'succeeded';
        state.items = action.payload.map((item) => createStrategyItem(item));
        if (state.selectedId && !state.items.some((strategy) => strategy.id === state.selectedId)) {
          state.selectedId = state.items[0]?.id ?? null;
        }
        if (!state.selectedId) {
          state.selectedId = state.items[0]?.id ?? null;
        }
      })
      .addCase(loadStrategies.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.error.message;
      })
      .addCase(loadStrategyTemplates.pending, (state) => {
        state.templatesStatus = 'loading';
        state.templatesError = undefined;
      })
      .addCase(loadStrategyTemplates.fulfilled, (state, action) => {
        state.templatesStatus = 'succeeded';
        state.templates = action.payload;
      })
      .addCase(loadStrategyTemplates.rejected, (state, action) => {
        state.templatesStatus = 'failed';
        state.templatesError = action.error.message;
      })
      .addCase(loadStrategyFiles.pending, (state) => {
        state.filesStatus = 'loading';
        state.filesError = undefined;
      })
      .addCase(loadStrategyFiles.fulfilled, (state, action) => {
        state.filesStatus = 'succeeded';
        state.files = action.payload;
      })
      .addCase(loadStrategyFiles.rejected, (state, action) => {
        state.filesStatus = 'failed';
        state.filesError = action.error.message;
      })
      .addCase(loadStrategyDetail.pending, (state, action) => {
        const id = action.meta.arg.strategyId;
        state.details[id] = state.details[id] ?? null;
        state.detailStatus[id] = 'loading';
        state.detailError[id] = undefined;
      })
      .addCase(loadStrategyDetail.fulfilled, (state, action) => {
        const { id, detail, runtime, risk } = action.payload;
        state.details[id] = detail;
        state.detailStatus[id] = 'succeeded';
        state.detailError[id] = undefined;
        state.runtime[id] = runtime;
        state.runtimeStatus[id] = 'succeeded';
        state.runtimeError[id] = undefined;
        state.risk[id] = risk;
        state.riskStatus[id] = 'succeeded';
        state.riskError[id] = undefined;
        state.subscriptionResyncStatus[id] = 'idle';
        state.subscriptionResyncError[id] = undefined;
        state.summaryStatus[id] = 'idle';
        state.summaryError[id] = undefined;
        state.riskSaveStatus[id] = 'idle';
        state.riskSaveError[id] = undefined;
        state.parameterStatus[id] = 'idle';
        state.parameterError[id] = undefined;
        updateStrategyItemFromDetail(state, id, {
          ...detail,
          triggerCount: detail.triggerCount ?? runtime.triggerCount ?? null,
          lastTriggeredAt: runtime.lastTriggeredAt ?? detail.lastTriggeredAt ?? null
        });
      })
      .addCase(loadStrategyDetail.rejected, (state, action) => {
        const id = action.meta.arg.strategyId;
        state.detailStatus[id] = 'failed';
        state.detailError[id] = action.error.message;
      })
      .addCase(loadStrategyRiskLogs.pending, (state, action) => {
        const id = action.meta.arg.strategyId;
        state.riskLogsStatus[id] = 'loading';
        state.riskLogsError[id] = undefined;
      })
      .addCase(loadStrategyRiskLogs.fulfilled, (state, action) => {
        const { id, logs } = action.payload;
        state.riskLogs[id] = logs ?? [];
        state.riskLogsStatus[id] = 'succeeded';
        state.riskLogsError[id] = undefined;
      })
      .addCase(loadStrategyRiskLogs.rejected, (state, action) => {
        const id = action.meta.arg.strategyId;
        state.riskLogsStatus[id] = 'failed';
        state.riskLogsError[id] = action.error.message;
      })
      .addCase(loadStrategyRuntime.pending, (state, action) => {
        const id = action.meta.arg.strategyId;
        state.runtimeStatus[id] = 'loading';
        state.runtimeError[id] = undefined;
      })
      .addCase(loadStrategyRuntime.fulfilled, (state, action) => {
        const { id, runtime } = action.payload;
        state.runtime[id] = runtime;
        state.runtimeStatus[id] = 'succeeded';
        state.runtimeError[id] = undefined;
        state.subscriptionResyncStatus[id] = 'idle';
        state.subscriptionResyncError[id] = undefined;
        const detail = state.details[id];
        if (detail) {
          state.details[id] = {
            ...detail,
            triggerCount: runtime.triggerCount ?? detail.triggerCount ?? null,
            lastTriggeredAt: runtime.lastTriggeredAt ?? detail.lastTriggeredAt ?? null,
            updatedAt: detail.updatedAt ?? runtime.snapshot.refreshedAt ?? null
          };
        }
        const index = state.items.findIndex((strategy) => strategy.id === id);
        if (index !== -1) {
          state.items[index] = mergeStrategyItem(state.items[index], {
            id,
            triggerCount: runtime.triggerCount ?? state.items[index].triggerCount ?? null,
            lastTriggeredAt: runtime.lastTriggeredAt ?? state.items[index].lastTriggeredAt ?? null
          });
        }
      })
      .addCase(loadStrategyRuntime.rejected, (state, action) => {
        const id = action.meta.arg.strategyId;
        state.runtimeStatus[id] = 'failed';
        state.runtimeError[id] = action.error.message;
      })
      .addCase(resyncStrategySubscription.pending, (state, action) => {
        const id = normalizeStrategyId(action.meta.arg.strategyId);
        state.subscriptionResyncStatus[id] = 'loading';
        state.subscriptionResyncError[id] = undefined;
      })
      .addCase(resyncStrategySubscription.fulfilled, (state, action) => {
        const { id, refreshed, message } = action.payload;
        state.subscriptionResyncStatus[id] = refreshed ? 'succeeded' : 'failed';
        state.subscriptionResyncError[id] = refreshed ? undefined : message ?? undefined;
      })
      .addCase(resyncStrategySubscription.rejected, (state, action) => {
        const id = normalizeStrategyId(action.meta.arg.strategyId);
        state.subscriptionResyncStatus[id] = 'failed';
        const payloadMessage = typeof action.payload === 'string' ? action.payload : undefined;
        state.subscriptionResyncError[id] = payloadMessage ?? action.error.message;
      })
      .addCase(updateStrategySummarySettings.pending, (state, action) => {
        const id = action.meta.arg.strategyId;
        state.summaryStatus[id] = 'loading';
        state.summaryError[id] = undefined;
      })
      .addCase(updateStrategySummarySettings.fulfilled, (state, action) => {
        const { id, detail } = action.payload;
        state.summaryStatus[id] = 'succeeded';
        state.summaryError[id] = undefined;
        const existing = state.details[id];
        state.details[id] = existing ? { ...existing, ...detail } : detail;
        const index = state.items.findIndex((strategy) => strategy.id === id);
        if (index !== -1) {
          state.items[index] = mergeStrategyItem(state.items[index], {
            id,
            symbol: detail.primarySymbol ?? state.items[index].symbol,
            description: detail.description ?? state.items[index].description ?? null,
            templateId: detail.strategyType ?? state.items[index].templateId ?? null,
            dataSource: detail.dataSource ?? state.items[index].dataSource ?? null,
            strategyOrigin: detail.strategyOrigin ?? state.items[index].strategyOrigin ?? null,
            schedule: detail.schedule ?? state.items[index].schedule ?? null,
            triggerCount: detail.triggerCount ?? state.items[index].triggerCount ?? null,
            lastTriggeredAt: detail.lastTriggeredAt ?? state.items[index].lastTriggeredAt ?? null,
            lastUpdatedAt: detail.updatedAt ?? state.items[index].lastUpdatedAt ?? null
          });
        }
      })
      .addCase(updateStrategySummarySettings.rejected, (state, action) => {
        const id = action.meta.arg.strategyId;
        state.summaryStatus[id] = 'failed';
        state.summaryError[id] = action.error.message;
      })
      .addCase(loadStrategyRiskSettings.pending, (state, action) => {
        const id = action.meta.arg.strategyId;
        state.riskStatus[id] = 'loading';
        state.riskError[id] = undefined;
      })
      .addCase(loadStrategyRiskSettings.fulfilled, (state, action) => {
        const { id, risk } = action.payload;
        state.risk[id] = risk;
        state.riskStatus[id] = 'succeeded';
        state.riskError[id] = undefined;
      })
      .addCase(loadStrategyRiskSettings.rejected, (state, action) => {
        const id = action.meta.arg.strategyId;
        state.riskStatus[id] = 'failed';
        state.riskError[id] = action.error.message;
      })
      .addCase(saveStrategyRiskSettings.pending, (state, action) => {
        const id = action.meta.arg.strategyId;
        state.riskSaveStatus[id] = 'loading';
        state.riskSaveError[id] = undefined;
      })
      .addCase(saveStrategyRiskSettings.fulfilled, (state, action) => {
        const { id, risk } = action.payload;
        state.risk[id] = risk;
        state.riskSaveStatus[id] = 'succeeded';
        state.riskSaveError[id] = undefined;
        state.riskStatus[id] = 'succeeded';
      })
      .addCase(saveStrategyRiskSettings.rejected, (state, action) => {
        const id = action.meta.arg.strategyId;
        state.riskSaveStatus[id] = 'failed';
        state.riskSaveError[id] = action.error.message;
      })
      .addCase(loadStrategyCandles.pending, (state, action) => {
        const id = action.meta.arg.strategyId;
        state.candlesStatus[id] = 'loading';
        state.candlesError[id] = undefined;
        const previous = state.candlesRequest[id];
        state.candlesRequest[id] = {
          interval: action.meta.arg.interval ?? previous?.interval ?? '5m',
          intervalSeconds: previous?.intervalSeconds ?? null
        };
      })
      .addCase(loadStrategyCandles.fulfilled, (state, action) => {
        const { id, candles } = action.payload;
        state.candles[id] = candles;
        state.candlesStatus[id] = 'succeeded';
        state.candlesError[id] = undefined;
        const request = action.meta.arg;
        state.candlesRequest[id] = {
          interval: request.interval ?? candles.interval ?? '5m',
          intervalSeconds: candles.intervalSeconds ?? null
        };
      })
      .addCase(loadStrategyCandles.rejected, (state, action) => {
        const id = action.meta.arg.strategyId;
        state.candlesStatus[id] = 'failed';
        state.candlesError[id] = action.error.message;
      })
      // 性能摘要加载成功后合并到缓存，并更新列表项快照
      .addCase(loadStrategyPerformanceSummary.fulfilled, (state, action) => {
        const { id, period, summary, metrics } = action.payload;
        const key = period ?? 'day';
        if (!state.performance[id]) {
          state.performance[id] = {};
        }
        const existing = state.performance[id][key] ?? null;
        const merged: StrategyPerformanceSnapshot = existing
          ? { ...existing, period: key, summary }
          : { period: key, summary };
        state.performance[id][key] = merged;
        if (metrics === null) {
          state.metrics[id] = null;
        } else {
          const previousMetrics = state.metrics[id];
          state.metrics[id] = previousMetrics ? { ...previousMetrics, ...metrics } : metrics;
        }
        const index = state.items.findIndex((strategy) => strategy.id === id);
        if (index !== -1) {
          state.items[index] = mergeStrategyItem(state.items[index], {
            id,
            performanceSnapshot: merged,
            metricsSnapshot: state.metrics[id] ?? null
          });
        }
      })
      // 订单分页加载成功后合并到对应周期的性能快照
      .addCase(loadStrategyPerformanceOrders.fulfilled, (state, action) => {
        const { id, period, orders, page, pageSize, totalOrders, hasNext, marketTimezone } = action.payload;
        const key = period ?? 'day';
        if (!state.performance[id]) {
          state.performance[id] = {};
        }
        const existing = state.performance[id][key] ?? null;
        const merged: StrategyPerformanceSnapshot = existing
          ? { ...existing, period: key, orders, page, pageSize, totalOrders, hasNext, marketTimezone: marketTimezone ?? existing.marketTimezone ?? null }
          : { period: key, orders, page, pageSize, totalOrders, hasNext, marketTimezone: marketTimezone ?? null };
        state.performance[id][key] = merged;
        const index = state.items.findIndex((strategy) => strategy.id === id);
        if (index !== -1) {
          state.items[index] = mergeStrategyItem(state.items[index], {
            id,
            performanceSnapshot: merged
          });
        }
      })
      // 图表数据加载成功后合并到对应周期的性能快照
      .addCase(loadStrategyPerformanceCharts.fulfilled, (state, action) => {
        const { id, period, charts } = action.payload;
        const key = period ?? 'day';
        if (!state.performance[id]) {
          state.performance[id] = {};
        }
        const existing = state.performance[id][key] ?? null;
        const merged: StrategyPerformanceSnapshot = existing
          ? { ...existing, period: key, charts }
          : { period: key, charts };
        state.performance[id][key] = merged;
        const index = state.items.findIndex((strategy) => strategy.id === id);
        if (index !== -1) {
          state.items[index] = mergeStrategyItem(state.items[index], {
            id,
            performanceSnapshot: merged
          });
        }
      })
      // 日历数据加载成功后合并到对应周期的性能快照
      .addCase(loadStrategyPerformanceCalendar.fulfilled, (state, action) => {
        const { id, period, calendar } = action.payload;
        const key = period ?? 'day';
        if (!state.performance[id]) {
          state.performance[id] = {};
        }
        const existing = state.performance[id][key] ?? null;
        const merged: StrategyPerformanceSnapshot = existing
          ? { ...existing, period: key, calendar }
          : { period: key, calendar };
        state.performance[id][key] = merged;
        const index = state.items.findIndex((strategy) => strategy.id === id);
        if (index !== -1) {
          state.items[index] = mergeStrategyItem(state.items[index], {
            id,
            performanceSnapshot: merged
          });
        }
      })
      .addCase(updateStrategyParameters.pending, (state, action) => {
        const id = action.meta.arg.strategyId;
        state.parameterStatus[id] = 'loading';
        state.parameterError[id] = undefined;
      })
      .addCase(updateStrategyParameters.fulfilled, (state, action) => {
        const { id, parameters } = action.payload as {
          id: string;
          parameters: Record<string, unknown>;
        };
        state.parameterStatus[id] = 'succeeded';
        state.parameterError[id] = undefined;
        const detail = state.details[id];
        if (detail) {
          const nextParameters = { ...(detail.parameters ?? {}) };
          for (const [key, value] of Object.entries(parameters)) {
            nextParameters[key] = value;
          }
          const exitAliases = ['mode', 'exit_mode', 'exit_type', 'exit_strategy', 'strategy_exit', 'exit_method'];
          for (const alias of exitAliases) {
            for (const [key, value] of Object.entries(parameters)) {
              if (exitAliases.includes(key) && alias !== key) {
                nextParameters[alias] = value as unknown;
              }
            }
          }
          const nextDefinitions = Array.isArray(detail.parameterDefinitions)
            ? detail.parameterDefinitions.map((def) => {
                if (
                  def &&
                  typeof def.name === 'string' &&
                  Object.prototype.hasOwnProperty.call(parameters, def.name)
                ) {
                  return { ...def, value: (parameters as Record<string, unknown>)[def.name] };
                }
                if (def && typeof def.name === 'string') {
                  const nameLower = def.name.toLowerCase();
                  const aliasHit = exitAliases.find((a) => a === nameLower);
                  if (aliasHit) {
                    for (const a of exitAliases) {
                      if (Object.prototype.hasOwnProperty.call(parameters, a)) {
                        return { ...def, value: (parameters as Record<string, unknown>)[a] };
                      }
                    }
                  }
                }
                return def;
              })
            : detail.parameterDefinitions ?? null;
          let nextExitConfig = detail.exit_config ?? null;
          const rawExit = (parameters as Record<string, unknown>)?.exit_config;
          if (rawExit && typeof rawExit === 'object' && !Array.isArray(rawExit)) {
            const record = rawExit as Record<string, unknown>;
            const makeDef = (name: string, type: string, label?: string) => ({
              name,
              label: typeof label === 'string' && label.trim() ? label : name,
              type,
              value: (record as Record<string, unknown>)[name]
            });
            const defs: Array<Record<string, unknown>> = [];
            if (record.mode !== undefined) defs.push(makeDef('mode', 'select', '退出方式'));
            if (record.risk_amount !== undefined) defs.push(makeDef('risk_amount', 'float', '风险金额'));
            if (record.rr_ratio !== undefined) defs.push(makeDef('rr_ratio', 'float', 'RR 比例'));
            if (record.atr_length !== undefined) defs.push(makeDef('atr_length', 'int', 'ATR 长度'));
            if (record.atr_multiplier !== undefined) defs.push(makeDef('atr_multiplier', 'float', 'ATR 倍数'));
            if ((record as Record<string, unknown>).trailing_multiplier !== undefined)
              defs.push(makeDef('trailing_multiplier', 'float', '跟踪 ATR 倍数'));
            nextExitConfig = defs.length ? defs : null;
          }
          state.details[id] = {
            ...detail,
            parameters: nextParameters,
            parameterDefinitions: nextDefinitions,
            exit_config: nextExitConfig
          };
        }
      })
      .addCase(updateStrategyParameters.rejected, (state, action) => {
        const id = action.meta.arg.strategyId;
        state.parameterStatus[id] = 'failed';
        state.parameterError[id] = action.error.message ?? '更新策略参数失败';
      })

      .addCase(loadStrategyMetrics.fulfilled, (state, action) => {
        const existing = state.metrics[action.payload.id];
        const incoming = action.payload.metrics;
        
        if (incoming === null) {
          state.metrics[action.payload.id] = null;
        } else if (existing) {
          state.metrics[action.payload.id] = { ...existing, ...incoming };
        } else {
          state.metrics[action.payload.id] = incoming;
        }

        const index = state.items.findIndex((strategy) => strategy.id === action.payload.id);
        if (index !== -1) {
          state.items[index] = mergeStrategyItem(state.items[index], {
            id: action.payload.id,
            metricsSnapshot: state.metrics[action.payload.id]
          });
        }
      })
      .addCase(createStrategy.pending, (state) => {
        state.saveStatus = 'loading';
        state.saveError = null;
        state.operations.__create__ = 'loading';
      })
      .addCase(createStrategy.fulfilled, (state, action) => {
        const strategy = createStrategyItem(action.payload);
        const index = state.items.findIndex((item) => item.id === strategy.id);
        if (index === -1) {
          state.items.push(strategy);
        } else {
          state.items[index] = mergeStrategyItem(state.items[index], strategy);
        }
        state.operations[strategy.id] = 'succeeded';
        state.operations.__create__ = 'succeeded';
        state.saveStatus = 'succeeded';
      })
      .addCase(createStrategy.rejected, (state, action) => {
        state.saveStatus = 'failed';
        state.saveError = action.error.message ?? '策略创建失败';
        state.operations.__create__ = 'failed';
      })
      .addCase(startStrategy.pending, (state, action) => {
        if (action.meta.arg?.strategyId) {
          const strategyKey = normalizeStrategyId(action.meta.arg.strategyId);
          state.operations[strategyKey] = 'loading';
          delete state.operationErrors[strategyKey];
        }
      })
      .addCase(startStrategy.fulfilled, (state, action) => {
        const strategy = createStrategyItem(action.payload);
        const index = state.items.findIndex((item) => item.id === strategy.id);
        if (index === -1) {
          state.items.push(strategy);
        } else {
          state.items[index] = mergeStrategyItem(state.items[index], strategy);
        }
        state.operations[strategy.id] = 'succeeded';
        delete state.operationErrors[strategy.id];
      })
      .addCase(startStrategy.rejected, (state, action) => {
        const strategyId = action.meta.arg?.strategyId;
        if (strategyId) {
          const strategyKey = normalizeStrategyId(strategyId);
          state.operations[strategyKey] = 'failed';
          state.operationErrors[strategyKey] =
            action.error.message ?? '启动策略失败，请稍后重试';
          state.error = action.error.message;
          const index = state.items.findIndex((item) => item.id === strategyKey);
          if (index !== -1) {
            state.items[index] = mergeStrategyItem(state.items[index], {
              id: strategyKey,
              status: 'error',
              enabled: false,
              active: false
            });
          }
        }
      })
      .addCase(updateStrategy.pending, (state, action) => {
        state.saveStatus = 'loading';
        state.saveError = null;
        const strategyId = action.meta.arg?.id;
        if (strategyId) {
          state.operations[strategyId] = 'loading';
        }
      })
      .addCase(updateStrategy.fulfilled, (state, action) => {
        const strategy = createStrategyItem(action.payload);
        const index = state.items.findIndex((item) => item.id === strategy.id);
        if (index === -1) {
          state.items.push(strategy);
        } else {
          state.items[index] = mergeStrategyItem(state.items[index], strategy);
        }
        state.operations[strategy.id] = 'succeeded';
        state.saveStatus = 'succeeded';
      })
      .addCase(updateStrategy.rejected, (state, action) => {
        state.saveStatus = 'failed';
        state.saveError = action.error.message ?? '策略更新失败';
        const strategyId = action.meta.arg?.id;
        if (strategyId) {
          state.operations[strategyId] = 'failed';
        }
      })
      .addCase(stopStrategy.pending, (state, action) => {
        if (action.meta.arg?.strategyId) {
          state.operations[action.meta.arg.strategyId] = 'loading';
        }
      })
      .addCase(stopStrategy.fulfilled, (state, action) => {
        const strategy = createStrategyItem(action.payload);
        const index = state.items.findIndex((item) => item.id === strategy.id);
        if (index === -1) {
          state.items.push(strategy);
        } else {
          state.items[index] = mergeStrategyItem(state.items[index], strategy);
        }
        state.operations[strategy.id] = 'succeeded';
      })
      .addCase(stopStrategy.rejected, (state, action) => {
        const strategyId = action.meta.arg?.strategyId;
        if (strategyId) {
          state.operations[strategyId] = 'failed';
          state.error = action.error.message;
        }
      })
      .addCase(deleteStrategy.pending, (state, action) => {
        const strategyId = action.meta.arg?.strategyId;
        if (strategyId) {
          state.operations[strategyId] = 'loading';
        }
      })
      .addCase(deleteStrategy.fulfilled, (state, action) => {
        const strategyId = action.payload;
        strategiesSlice.caseReducers.removeStrategy(state, {
          type: 'strategies/removeStrategy',
          payload: strategyId
        });
      })
      .addCase(deleteStrategy.rejected, (state, action) => {
        const strategyId = action.meta.arg?.strategyId;
        if (strategyId) {
          state.operations[strategyId] = 'failed';
        }
        state.error = action.error.message;
      });
  }
});

export const {
  setStrategies,
  upsertStrategy,
  updateStrategyStatus,
  selectStrategy,
  removeStrategy,
  setStrategyMetrics,
  setStrategyPerformance,
  setStrategyCandles,
  setStrategyFallbackMode,
  setStrategyRuntimeSnapshot,
  setMarketDataSubscriptions,
  setMarketDataSubscriptionsStatus,
  setMarketDataSubscriptionsStreamingEnabled,
  setStrategyOperationStatus,
  resetStrategySave
} = strategiesSlice.actions;

export default strategiesSlice.reducer;
