import { createAsyncThunk } from '@reduxjs/toolkit';
import type {
  StrategyFileItem,
  StrategyItem,
  StrategyMetricsSnapshot,
  StrategyPerformanceSnapshot,
  StrategyOrderItem,
  StrategyParameterConfig,
  StrategyScheduleWindow,
  StrategyTemplateItem,
  StrategyDetailSummary,
  StrategyRiskSettings,
  StrategyRuntimeDetail,
  StrategyCandlesSnapshot,
  StrategyRiskLogEntry
} from '@features/dashboard/types';
import type { RootState } from '@store/index';
import {
  fetchStrategyRiskLogs,
  getStrategyDetailSnapshot,
  getStrategyRuntimeSnapshot,
  getStrategyMetricsSnapshot,
  listStrategiesMapped,
  listStrategyTemplatesMapped,
  listStrategyFilesMapped,
  mapStrategyRecord,
  startStrategyRequest,
  stopStrategyRequest,
  resyncStrategySubscriptionRequest,
  createStrategyRequest,
  updateStrategyRequest,
  type StrategyMetricsParams,
  type StrategyStartParams,
  type StrategyStopParams,
  type StrategyRecordPayload,
  type StrategyMutationPayload,
  type StrategyMutationWarningPayload,
  updateStrategySummary,
  getStrategyRiskSettings,
  saveStrategyRiskSettingsRequest,
  type StrategyRuntimeParams,
  type StrategySummaryUpdateParams,
  type StrategyRiskSettingsMutation,
  getStrategyCandlesSnapshot,
  type StrategyCandlesParams,
  updateStrategyParametersRequest,
  type StrategyParameterUpdateParams,
  deleteStrategyRequest,
  type StrategyDeleteParams,
  type StrategyRiskLogsParams,
  StrategyApiError,
  fetchStrategyPerformanceSummary,
  fetchStrategyPerformanceOrders,
  mapStrategyPerformance,
  mapStrategyMetrics,
  fetchStrategyPerformanceCharts,
  fetchStrategyPerformanceCalendar
} from '@services/strategyApi';
import { addToast } from '@store/slices/toastSlice';
import { isScreenerStrategy } from '@features/strategies/utils/strategyKind';
import { SCREENER_KEYWORDS, includesKeyword } from '@features/strategies/components/strategyKeywords';

const normalizeStrategyId = (value: string | number): string =>
  typeof value === 'string' ? value : String(value);

const isScreenerOrUnknown = (id: string, state: RootState): boolean => {
  const item = state.strategies.items.find((entry) => entry.id === id);
  
  if (isScreenerStrategy(item ?? null)) {
    return true;
  }

  // Double check with details if item is missing or incomplete
  if (!item) {
    const detail = state.strategies.details[id];
    if (detail) {
      if (detail.screenerProfile) {
        return true;
      }
      if (detail.dataSource && includesKeyword(detail.dataSource, SCREENER_KEYWORDS)) {
        return true;
      }
    } else {
      // If we have no info about the strategy (neither item nor detail), 
      // we should not fetch metrics blindly to avoid 404s for potential screeners
      return true;
    }
  }
  return false;
};

const ensureAuthToken = (thunkAPI: { getState: () => RootState }, message: string): string => {
  const token = thunkAPI.getState().auth.token;
  if (!token) {
    throw new Error(message);
  }
  return token;
};

export const loadStrategies = createAsyncThunk<
  StrategyItem[],
  { refresh?: boolean; period?: string } | void,
  { state: RootState }
>(
  'strategies/loadList',
  async (params, thunkAPI) => {
    const token = thunkAPI.getState().auth.token;
    if (!token) {
      throw new Error('缺少访问令牌，无法加载策略列表');
    }
    const refresh = typeof (params as { refresh?: boolean } | void)?.refresh === 'boolean'
      ? (params as { refresh?: boolean }).refresh
      : undefined;
    const period = typeof (params as { period?: string } | void)?.period === 'string'
      ? (params as { period?: string }).period
      : undefined;
    return listStrategiesMapped(token, { refresh, period });
  }
);

// 已废弃：使用独立的标签页加载函数替代
// export const loadStrategyPerformance = createAsyncThunk<...>

export const loadStrategyPerformanceSummary = createAsyncThunk<
  {
    id: string;
    period: string;
    summary: StrategyPerformanceSnapshot['summary'];
    metrics: StrategyMetricsSnapshot | null;
  },
  {
    strategyId: string | number;
    period?: string;
    page?: number;
    pageSize?: number;
  },
  { state: RootState, condition: (params: { strategyId: string | number; period?: string }, api: { getState: () => RootState }) => boolean }
>('strategies/loadPerformanceSummary', async (params, thunkAPI) => {
  const token = thunkAPI.getState().auth.token;
  if (!token) {
    throw new Error('缺少访问令牌，无法加载策略绩效摘要');
  }
  const response = await fetchStrategyPerformanceSummary(token, params);
  // Ensure strategy_id/id is properly typed as string | number
  const strategyId = (response.strategy_id ?? response.id) as string | number;
  const id = normalizeStrategyId(strategyId);
  // Ensure period is a string, not an empty object
  const responsePeriod = typeof response.period === 'string' ? response.period : undefined;
  const paramsPeriod = typeof params.period === 'string' ? params.period : undefined;
  const period = responsePeriod ?? paramsPeriod ?? 'day';
  // Cast summary to the correct type
  const summary = response.summary as StrategyPerformanceSnapshot['summary'];
  const metrics = mapStrategyMetrics({
    metrics:
      response.metrics && typeof response.metrics === 'object'
        ? (response.metrics as Record<string, unknown>)
        : (response.summary as Record<string, unknown>) ?? null,
    period,
    updated_at: typeof response.updated_at === 'string' ? response.updated_at : null,
    last_updated_at:
      typeof (response as { last_updated_at?: unknown }).last_updated_at === 'string'
        ? ((response as { last_updated_at?: string }).last_updated_at ?? null)
        : null
  });
  return { id, period, summary, metrics };
}, {
  condition: (params, { getState }) => {
    const state = getState();
    const id = normalizeStrategyId(params.strategyId);
    
    // Check if it's a screener strategy
    const item = state.strategies.items.find((entry) => entry.id === id);
    if (isScreenerStrategy(item ?? null)) {
      return false;
    }

    const status = state.strategies.summaryStatus[id];
    if (status === 'loading') {
      return false;
    }
    return true;
  }
});

export const loadStrategyPerformanceOrders = createAsyncThunk<
  {
    id: string;
    period: string;
    orders: StrategyPerformanceSnapshot['orders'];
    page: number;
    pageSize: number;
    totalOrders: number;
    hasNext: boolean;
    marketTimezone?: string | null;
  },
  {
    strategyId: string | number;
    period?: string;
    page?: number;
    pageSize?: number;
    startDate?: string; // ISO date string
    endDate?: string; // ISO date string
  },
  { state: RootState }
>('strategies/loadPerformanceOrders', async (params, thunkAPI) => {
  const token = thunkAPI.getState().auth.token;
  if (!token) {
    throw new Error('缺少访问令牌，无法加载策略订单');
  }
  const response = await fetchStrategyPerformanceOrders(token, params);
  // Ensure strategy_id/id is properly typed as string | number
  const strategyId = (response.strategy_id ?? response.id) as string | number;
  const id = normalizeStrategyId(strategyId);
  // Ensure period is a string, not an empty object
  const responsePeriod = typeof response.period === 'string' ? response.period : undefined;
  const paramsPeriod = typeof params.period === 'string' ? params.period : undefined;
  const period = responsePeriod ?? paramsPeriod ?? 'day';
  // Use shared mapper to ensure correct order item shape and pagination fields
  const mapped = mapStrategyPerformance(id, response, period, undefined, ['orders']);
  const orders = (mapped.orders ?? []) as StrategyOrderItem[];
  const page = (mapped.page ?? response.orders?.page ?? response.page ?? params.page ?? 1) as number;
  const pageSize = (mapped.pageSize ?? response.orders?.page_size ?? response.page_size ?? params.pageSize ?? (orders.length || 0)) as number;
  const totalOrders = (mapped.totalOrders ?? response.orders?.total ?? orders.length) as number;
  const hasNext = Boolean(mapped.hasNext ?? response.orders?.has_next);
  const marketTimezone = mapped.marketTimezone ?? null;
  return {
    id,
    period,
    orders,
    page,
    pageSize,
    totalOrders,
    hasNext,
    marketTimezone
  };
}, {
  condition: (params, { getState }) => {
    const state = getState();
    const id = normalizeStrategyId(params.strategyId);
    
    if (isScreenerOrUnknown(id, state)) {
      return false;
    }
    return true;
  }
});

export const loadStrategyPerformanceCharts = createAsyncThunk<
  {
    id: string;
    period: string;
    charts: StrategyPerformanceSnapshot['charts'];
  },
  {
    strategyId: string | number;
    period?: string;
  },
  { state: RootState }
>('strategies/loadPerformanceCharts', async (params, thunkAPI) => {
  const token = thunkAPI.getState().auth.token;
  if (!token) {
    throw new Error('缺少访问令牌，无法加载策略图表');
  }
  const response = await fetchStrategyPerformanceCharts(token, params);
  // Ensure strategy_id/id is properly typed as string | number
  const strategyId = (response.strategy_id ?? response.id) as string | number;
  const id = normalizeStrategyId(strategyId);
  // Ensure period is a string, not an empty object
  const responsePeriod = typeof response.period === 'string' ? response.period : undefined;
  const paramsPeriod = typeof params.period === 'string' ? params.period : undefined;
  const period = responsePeriod ?? paramsPeriod ?? 'day';
  // Use the charts data directly from the response - it should already be in the correct format
  const charts = response.charts as StrategyPerformanceSnapshot['charts'];
  return { id, period, charts };
}, {
  condition: (params, { getState }) => {
    const state = getState();
    const id = normalizeStrategyId(params.strategyId);
    if (isScreenerOrUnknown(id, state)) {
      return false;
    }
    return true;
  }
});

export const loadStrategyPerformanceCalendar = createAsyncThunk<
  {
    id: string;
    period: string;
    calendar: StrategyPerformanceSnapshot['calendar'];
  },
  {
    strategyId: string | number;
    period?: string;
  },
  { state: RootState }
>('strategies/loadPerformanceCalendar', async (params, thunkAPI) => {
  const token = thunkAPI.getState().auth.token;
  if (!token) {
    throw new Error('缺少访问令牌，无法加载策略日历');
  }
  const response = await fetchStrategyPerformanceCalendar(token, params);
  // Ensure strategy_id/id is properly typed as string | number
  const strategyId = (response.strategy_id ?? response.id) as string | number;
  const id = normalizeStrategyId(strategyId);
  // Ensure period is a string, not an empty object
  const responsePeriod = typeof response.period === 'string' ? response.period : undefined;
  const paramsPeriod = typeof params.period === 'string' ? params.period : undefined;
  const period = responsePeriod ?? paramsPeriod ?? 'day';
  // Use the calendar data directly from the response - it should already be in the correct format
  const calendar = response.calendar as StrategyPerformanceSnapshot['calendar'];
  return { id, period, calendar };
}, {
  condition: (params, { getState }) => {
    const state = getState();
    const id = normalizeStrategyId(params.strategyId);
    const item = state.strategies.items.find((entry) => entry.id === id);
    if (isScreenerStrategy(item ?? null)) {
      return false;
    }
    return true;
  }
});

export const loadStrategyDetail = createAsyncThunk<
  { id: string; detail: StrategyDetailSummary; runtime: StrategyRuntimeDetail; risk: StrategyRiskSettings },
  { strategyId: string },
  { state: RootState, condition: (params: { strategyId: string }, api: { getState: () => RootState }) => boolean }
>('strategies/loadDetail', async ({ strategyId }, thunkAPI) => {
  const token = thunkAPI.getState().auth.token;
  if (!token) {
    throw new Error('缺少访问令牌，无法加载策略详情');
  }
  const snapshot = await getStrategyDetailSnapshot(token, strategyId);
  return { id: strategyId, detail: snapshot.detail, runtime: snapshot.runtime, risk: snapshot.risk };
}, {
  condition: (params, { getState }) => {
    const state = getState();
    const status = state.strategies.detailStatus[params.strategyId];
    if (status === 'loading') {
      return false;
    }
    return true;
  }
});

export const loadStrategyRuntime = createAsyncThunk<
  { id: string; runtime: StrategyRuntimeDetail },
  StrategyRuntimeParams,
  { state: RootState }
>('strategies/loadRuntime', async (params, thunkAPI) => {
  const token = thunkAPI.getState().auth.token;
  if (!token) {
    throw new Error('缺少访问令牌，无法刷新运行时指标');
  }
  const runtime = await getStrategyRuntimeSnapshot(token, params);
  const id = normalizeStrategyId(params.strategyId);
  return { id, runtime };
});

export const loadStrategyRiskLogs = createAsyncThunk<
  { id: string; logs: StrategyRiskLogEntry[] },
  StrategyRiskLogsParams,
  { state: RootState, condition: (params: StrategyRiskLogsParams, api: { getState: () => RootState }) => boolean }
>('strategies/loadRiskLogs', async (params, thunkAPI) => {
  const token = thunkAPI.getState().auth.token;
  if (!token) {
    throw new Error('缺少访问令牌，无法加载风险日志');
  }
  const result = await fetchStrategyRiskLogs(token, params);
  const id = normalizeStrategyId(result.strategyId);
  return { id, logs: result.entries };
}, {
  condition: (params, { getState }) => {
    const state = getState();
    const id = normalizeStrategyId(params.strategyId);
    const status = state.strategies.riskLogsStatus[id];
    if (status === 'loading') {
      return false;
    }
    return true;
  }
});

export const loadStrategyMetrics = createAsyncThunk<
  { id: string; metrics: StrategyMetricsSnapshot | null },
  StrategyMetricsParams,
  { state: RootState, condition: (params: StrategyMetricsParams, api: { getState: () => RootState }) => boolean }
>('strategies/loadMetrics', async (params, thunkAPI) => {
  const token = thunkAPI.getState().auth.token;
  if (!token) {
    throw new Error('缺少访问令牌，无法加载策略指标');
  }
  const metrics = await getStrategyMetricsSnapshot(token, params);
  const id = normalizeStrategyId(params.strategyId);
  return { id, metrics };
}, {
  condition: (params, { getState }) => {
    const state = getState();
    const id = normalizeStrategyId(params.strategyId);
    
    if (isScreenerOrUnknown(id, state)) {
      return false;
    }

    const existing = state.strategies.metrics[id];
    const periodMatches = existing?.period === params.period;
    if (periodMatches) {
      return false;
    }
    return true;
  }
});

export const loadStrategyTemplates = createAsyncThunk<
  StrategyTemplateItem[],
  void,
  { state: RootState }
>('strategies/loadTemplates', async (_, thunkAPI) => {
  const token = thunkAPI.getState().auth.token;
  if (!token) {
    throw new Error('缺少访问令牌，无法获取策略模板');
  }
  return listStrategyTemplatesMapped(token);
});

export const loadStrategyFiles = createAsyncThunk<
  StrategyFileItem[],
  void,
  { state: RootState }
>('strategies/loadFiles', async (_, thunkAPI) => {
  const token = thunkAPI.getState().auth.token;
  if (!token) {
    throw new Error('缺少访问令牌，无法获取策略文件列表');
  }
  return listStrategyFilesMapped(token);
});

export const updateStrategySummarySettings = createAsyncThunk<
  { id: string; detail: StrategyDetailSummary },
  StrategySummaryUpdateParams,
  { state: RootState }
>('strategies/updateSummary', async (params, thunkAPI) => {
  const token = thunkAPI.getState().auth.token;
  if (!token) {
    throw new Error('缺少访问令牌，无法更新策略摘要');
  }
  const detail = await updateStrategySummary(token, params);
  const id = normalizeStrategyId(params.strategyId);
  return { id, detail };
});

export const loadStrategyRiskSettings = createAsyncThunk<
  { id: string; risk: StrategyRiskSettings },
  { strategyId: string },
  { state: RootState }
>('strategies/loadRiskSettings', async ({ strategyId }, thunkAPI) => {
  const token = thunkAPI.getState().auth.token;
  if (!token) {
    throw new Error('缺少访问令牌，无法加载风险设置');
  }
  const risk = await getStrategyRiskSettings(token, strategyId);
  return { id: strategyId, risk };
});

export const saveStrategyRiskSettings = createAsyncThunk<
  { id: string; risk: StrategyRiskSettings },
  StrategyRiskSettingsMutation,
  { state: RootState }
>('strategies/saveRiskSettings', async (params, thunkAPI) => {
  const token = thunkAPI.getState().auth.token;
  if (!token) {
    throw new Error('缺少访问令牌，无法保存风险设置');
  }
  const risk = await saveStrategyRiskSettingsRequest(token, params);
  return { id: params.strategyId, risk };
});

export const loadStrategyCandles = createAsyncThunk<
  { id: string; candles: StrategyCandlesSnapshot },
  StrategyCandlesParams,
  { state: RootState }
>('strategies/loadCandles', async (params, thunkAPI) => {
  const token = thunkAPI.getState().auth.token;
  if (!token) {
    throw new Error('缺少访问令牌，无法获取策略蜡烛图数据');
  }
  const candles = await getStrategyCandlesSnapshot(token, params);
  const id = normalizeStrategyId(params.strategyId);
  return { id, candles };
});

export const updateStrategyParameters = createAsyncThunk<
  { id: string; parameters: Record<string, unknown>; exitConfig: Array<Record<string, unknown>> | null },
  StrategyParameterUpdateParams,
  { state: RootState }
>('strategies/updateParameters', async (params, thunkAPI) => {
  const token = thunkAPI.getState().auth.token;
  if (!token) {
    throw new Error('缺少访问令牌，无法更新策略参数');
  }
  const strategyKey = normalizeStrategyId(params.strategyId);
  const response = await updateStrategyParametersRequest(token, params);
  const id = strategyKey;
  return { id, parameters: response.parameters ?? {}, exitConfig: response.exit_config ?? null };
});

const mapRecordToItem = (record: StrategyRecordPayload): StrategyItem => {
  return mapStrategyRecord(record);
};

const notifyStrategyWarnings = (
  dispatch: (action: unknown) => unknown,
  warnings?: StrategyMutationWarningPayload[] | null
): void => {
  if (!warnings?.length) {
    return;
  }
  warnings.forEach((warning) => {
    const code = warning.code?.trim() ?? 'auto_start_failed';
    let message = warning.message?.trim() || '策略已保存，但未能立即启动';
    if (code === 'auto_start_weekend_blocked') {
      message = '周末不能执行策略';
    }
    dispatch(
      addToast({
        message,
        variant: 'info',
        preventDuplicates: true
      })
    );
  });
};

export interface SaveStrategyArgs {
  id?: string;
  name: string;
  symbol: string;
  mode: StrategyItem['mode'];
  templateId?: string | null;
  description?: string | null;
  skipWeekends?: boolean;
  windows: StrategyScheduleWindow[];
  parameters: StrategyParameterConfig[];
  enabled?: boolean;
  active?: boolean;
  tags?: string[];
  filePath?: string | null;
  screenerProfile?: Record<string, unknown> | null;
  screenerSchedule?: Record<string, unknown> | null;
}

const toMutationPayload = (payload: SaveStrategyArgs): StrategyMutationPayload => ({
  name: payload.name,
  symbol: payload.symbol,
  mode: payload.mode,
  templateId: payload.templateId ?? null,
  description: payload.description ?? null,
  skipWeekends: payload.skipWeekends ?? true,
  windows: payload.windows,
  parameters: payload.parameters,
  enabled: payload.enabled,
  active: payload.active,
  tags: payload.tags ?? null,
  filePath: payload.filePath ?? null,
  screenerProfile: payload.screenerProfile ?? undefined,
  screenerSchedule: payload.screenerSchedule ?? undefined
});

export const startStrategy = createAsyncThunk<
  StrategyItem,
  StrategyStartParams,
  { state: RootState }
>('strategies/start', async (params, thunkAPI) => {
  const token = thunkAPI.getState().auth.token;
  if (!token) {
    throw new Error('缺少访问令牌，无法启动策略');
  }
  try {
    const record = await startStrategyRequest(token, params);
    return mapRecordToItem(record);
  } catch (error) {
    let message = '启动策略失败';
    if (error instanceof StrategyApiError && error.message) {
      message = error.message;
    } else if (error instanceof Error && error.message) {
      message = error.message;
    }
    thunkAPI.dispatch(
      addToast({
        message: `启动策略失败：${message}`,
        variant: 'error',
        preventDuplicates: true
      })
    );
    throw error;
  }
});

export const stopStrategy = createAsyncThunk<
  StrategyItem,
  StrategyStopParams,
  { state: RootState }
>('strategies/stop', async (params, thunkAPI) => {
  const token = thunkAPI.getState().auth.token;
  if (!token) {
    throw new Error('缺少访问令牌，无法停止策略');
  }
  const record = await stopStrategyRequest(token, params);
  return mapRecordToItem(record);
});

export const resyncStrategySubscription = createAsyncThunk<
  { id: string; refreshed: boolean; message: string | null; strategy?: string | null },
  { strategyId: string | number },
  { state: RootState; rejectValue: string }
>('strategies/resyncSubscription', async ({ strategyId }, thunkAPI) => {
  try {
    const token = ensureAuthToken(thunkAPI, '缺少访问令牌，无法重新同步订阅');
    const id = normalizeStrategyId(strategyId);
    const response = await resyncStrategySubscriptionRequest(token, id);
    return {
      id,
      refreshed: response.refreshed,
      message: response.message ?? null,
      strategy: response.strategy ?? null
    };
  } catch (error) {
    let message = '重新同步策略订阅失败';
    if (error instanceof StrategyApiError && error.message) {
      message = error.message;
    } else if (error instanceof Error && error.message) {
      message = error.message;
    }
    return thunkAPI.rejectWithValue(message);
  }
});

export const deleteStrategy = createAsyncThunk<
  string,
  StrategyDeleteParams,
  { state: RootState }
>('strategies/delete', async (params, thunkAPI) => {
  const token = thunkAPI.getState().auth.token;
  if (!token) {
    throw new Error('缺少访问令牌，无法删除策略');
  }
  await deleteStrategyRequest(token, params);
  return normalizeStrategyId(params.strategyId);
});

export const createStrategy = createAsyncThunk<
  StrategyItem,
  SaveStrategyArgs,
  { state: RootState }
>('strategies/create', async (payload, thunkAPI) => {
  const token = thunkAPI.getState().auth.token;
  if (!token) {
    throw new Error('缺少访问令牌，无法创建策略');
  }
  const response = await createStrategyRequest(token, toMutationPayload(payload));
  notifyStrategyWarnings(thunkAPI.dispatch, response.warnings ?? null);
  return mapRecordToItem(response.strategy);
});

export const updateStrategy = createAsyncThunk<
  StrategyItem,
  SaveStrategyArgs,
  { state: RootState }
>('strategies/update', async (payload, thunkAPI) => {
  const token = thunkAPI.getState().auth.token;
  if (!token) {
    throw new Error('缺少访问令牌，无法更新策略');
  }
  if (!payload.id) {
    throw new Error('缺少策略 ID，无法更新策略');
  }
  const response = await updateStrategyRequest(token, {
    strategyId: payload.id,
    payload: toMutationPayload(payload)
  });
  notifyStrategyWarnings(thunkAPI.dispatch, response.warnings ?? null);
  return mapRecordToItem(response.strategy);
});
