import { createAsyncThunk } from '@reduxjs/toolkit';
import type {
  DashboardData,
  DepthSnapshot,
  PositionItem,
  SymbolInfo,
  TimeframeOption
} from '@features/dashboard/types';
import { resolveTickSize } from '@features/dashboard/utils/priceFormatting';
import { fetchCurrentUser, SessionUser } from '@services/authApi';
import {
  fetchAccountPositions,
  fetchAccountSummary,
  mapAccountPositions,
  mapAccountSummary,
  isAccountServiceUnavailable,
  mergeServiceWarnings,
  ACCOUNT_SERVICE_OFFLINE_MESSAGE
} from '@services/accountApi';
import { listOrders } from '@services/ordersApi';
import { ORDERS_DEFAULT_PAGE_SIZE } from '@utils/constants';
import { listNotifications } from '@services/notificationsApi';
// 行情目录改为按需加载：移除初始化阶段的目录请求
import {
  loadMarketSnapshot,
  MarketApiError,
  resolveDurationSeconds
} from '@services/marketApi';
import type { MarketSnapshotResult } from '@services/marketApi';
import {
  fetchRiskEvents,
  fetchRiskMetrics,
  fetchRiskRules,
  mapRiskEvents,
  mapRiskMetrics,
  mapRiskRules
} from '@services/riskApi';
import { listStrategiesMapped } from '@services/strategyApi';
import { setAccountServiceWarning, setAccountSummary, setPositions } from '@store/slices/accountSlice';
import type { RootState } from '@store/index';
import { setRiskEvents, setRiskMetrics } from '@store/slices/riskSlice';
import { createPublicSessionUser, isAnonymousAccessAllowed } from '@store/publicSession';

const fallbackTimeframes: TimeframeOption[] = [
  { value: '1m', label: '1m' },
  { value: '5m', label: '5m' },
  { value: '15m', label: '15m' },
  { value: '1h', label: '1h' }
];
const preferredDefaultTimeframe = '5m';
const preferredDefaultDuration = '1D';
const allowedTimeframeOrder = ['1m', '5m', '15m', '1h'] as const;

const ensureAllowedTimeframes = (options: TimeframeOption[]): TimeframeOption[] => {
  const provided = new Map<string, TimeframeOption>();
  for (const option of options) {
    if (allowedTimeframeOrder.includes(option.value as (typeof allowedTimeframeOrder)[number])) {
      provided.set(option.value, option);
    }
  }
  return allowedTimeframeOrder
    .map((value) => provided.get(value) ?? fallbackTimeframes.find((item) => item.value === value) ?? null)
    .filter((item): item is TimeframeOption => Boolean(item));
};

const createDepthSnapshot = (symbol: string | null): DepthSnapshot => ({
  bids: [],
  asks: [],
  midPrice: null,
  spread: null,
  symbol: symbol ?? undefined,
  updatedAt: new Date().toISOString()
});

// 移除未使用的数值校验工具，避免诊断报错。

const ensureSymbolList = (symbols: SymbolInfo[], fallbackSymbol: string | null): SymbolInfo[] => {
  if (!fallbackSymbol) {
    return symbols;
  }
  if (symbols.some((item) => item.symbol === fallbackSymbol)) {
    return symbols;
  }
  return [
    {
      symbol: fallbackSymbol,
      description: fallbackSymbol,
      exchange: '—',
      tickSize: resolveTickSize(fallbackSymbol),
      secType: null,
      domCapable: null
    },
    ...symbols
  ];
};

const normalizePositionsWithSymbols = (
  positions: PositionItem[],
  symbols: SymbolInfo[]
): PositionItem[] => {
  if (!positions.length || !symbols.length) {
    return positions;
  }

  const bySymbol = new Map<string, SymbolInfo>();
  for (const info of symbols) {
    bySymbol.set(info.symbol.toUpperCase(), info);
    const root = info.symbol ? info.symbol.replace(/\d+.*/, '').toUpperCase() : null;
    if (root && !bySymbol.has(root)) {
      bySymbol.set(root, info);
    }
  }

  // 撤回初始化阶段的价格归一化，保持后端或实时订阅提供的原始价格与 PnL。
  // 这避免了由于 tickSize 推断导致的尺度变化，从而造成 PnL 百分比异常。
  return positions;
};

const normaliseSymbolCandidate = (value: string | null | undefined): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};

const pickFirstSymbol = <T extends { symbol?: string | null }>(items: T[]): string | null => {
  for (const item of items) {
    const candidate = normaliseSymbolCandidate(item?.symbol);
    if (candidate) {
      return candidate;
    }
  }
  return null;
};

interface InitialSymbolInput {
  preferredSymbol: string | null;
  symbols: SymbolInfo[];
  positions: PositionItem[];
  orders: DashboardData['orders'];
  strategies: DashboardData['strategies'];
}

const resolveInitialSymbol = ({
  preferredSymbol,
  symbols,
  positions,
  orders,
  strategies
}: InitialSymbolInput): string | null => {
  const candidates: Array<string | null> = [
    normaliseSymbolCandidate(preferredSymbol),
    pickFirstSymbol(positions),
    pickFirstSymbol(orders),
    pickFirstSymbol(strategies),
    normaliseSymbolCandidate(symbols[0]?.symbol)
  ];

  for (const candidate of candidates) {
    if (candidate) {
      return candidate;
    }
  }

  return null;
};

export interface DashboardInitializationPayload {
  snapshot: DashboardData;
  user: SessionUser;
  notificationsOverview?: {
    total: number;
    unread: number;
    receivedAt: string;
  };
}

export const initializeDashboard = createAsyncThunk<DashboardInitializationPayload, void, { state: RootState }>(
  'app/initializeDashboard',
  async (_, thunkAPI) => {
    const state = thunkAPI.getState();
    const token = state.auth.token;

    if (!token) {
      throw new Error('未找到有效的访问令牌，请先登录。');
    }

    let user: SessionUser;
    try {
      user = await fetchCurrentUser(token);
    } catch (error) {
      const allowAnonymous = isAnonymousAccessAllowed();
      const existingUser = state.auth.user;
      if (existingUser) {
        user = existingUser;
      } else if (allowAnonymous) {
        console.warn('获取用户信息失败，将使用访客身份继续：', error);
        user = createPublicSessionUser();
      } else {
        throw new Error('获取用户信息失败，请重新登录。');
      }
    }

    const [summaryResult, positionsResult] = await Promise.all([
      fetchAccountSummary(token),
      fetchAccountPositions(token)
    ]);

    const summaryOffline = isAccountServiceUnavailable(summaryResult.serviceStatus);
    const positionsOffline = isAccountServiceUnavailable(positionsResult.serviceStatus);
    const warningMessages: string[] = [];

    let account = state.account.summary ?? null;
    if (summaryOffline) {
      warningMessages.push(
        summaryResult.serviceStatus?.trim() || ACCOUNT_SERVICE_OFFLINE_MESSAGE
      );
    } else {
      account = mapAccountSummary(summaryResult.data);
      thunkAPI.dispatch(setAccountSummary(account));
      if (summaryResult.serviceStatus) {
        warningMessages.push(summaryResult.serviceStatus.trim());
      }
    }

    const existingPositions = state.account.positions ?? [];
    let positions = positionsOffline
      ? existingPositions.map((position) => ({ ...position }))
      : mapAccountPositions(positionsResult.data);

    if (positionsOffline) {
      warningMessages.push(
        positionsResult.serviceStatus?.trim() || ACCOUNT_SERVICE_OFFLINE_MESSAGE
      );
    } else if (positionsResult.serviceStatus) {
      warningMessages.push(positionsResult.serviceStatus.trim());
    }

    const serviceWarning =
      mergeServiceWarnings(...warningMessages) ?? (summaryOffline || positionsOffline
        ? ACCOUNT_SERVICE_OFFLINE_MESSAGE
        : null);
    thunkAPI.dispatch(setAccountServiceWarning(serviceWarning));

    let orders: DashboardData['orders'] = [];
    try {
      const ordersResult = await listOrders(token, { page: 1, pageSize: ORDERS_DEFAULT_PAGE_SIZE });
      orders = ordersResult.items;
    } catch (error) {
      console.warn('加载订单数据失败，将展示空列表：', error);
    }

    let notifications: DashboardData['notifications'] = [];
    let notificationsOverview: DashboardInitializationPayload['notificationsOverview'] = undefined;
    try {
      const notificationsResult = await listNotifications(token, { limit: 30 });
      notifications = notificationsResult.items;
      notificationsOverview = {
        total: notificationsResult.total,
        unread: notificationsResult.unread,
        receivedAt: new Date().toISOString()
      };
    } catch (error) {
      console.warn('加载通知数据失败，将展示空列表：', error);
      notificationsOverview = {
        total: 0,
        unread: 0,
        receivedAt: new Date().toISOString()
      };
    }

    let strategies: DashboardData['strategies'] = [];
    try {
      strategies = await listStrategiesMapped(token);
    } catch (error) {
      console.warn('加载策略数据失败，将展示空列表：', error);
    }

    let riskRules: DashboardData['riskRules'] = [];
    try {
      const [rulesResponse, metricsResponse, eventsResponse] = await Promise.all([
        fetchRiskRules(token),
        fetchRiskMetrics(token),
        fetchRiskEvents(token, { limit: 30 })
      ]);

      const metrics = mapRiskMetrics(metricsResponse);
      const rules = mapRiskRules(rulesResponse.items ?? [], metrics.rules);
      const events = mapRiskEvents(eventsResponse.items ?? []);

      riskRules = rules;
      thunkAPI.dispatch(setRiskMetrics(metrics));
      thunkAPI.dispatch(setRiskEvents(events));
    } catch (error) {
      console.warn('加载风控数据失败，将使用空数据：', error);
      thunkAPI.dispatch(setRiskMetrics(null));
      thunkAPI.dispatch(setRiskEvents([]));
    }

    // 初始化阶段不再请求行情目录，避免页面加载阻塞和后端目录扫描开销
    let symbols: SymbolInfo[] = [];
    let timeframes: TimeframeOption[] = [];
    const directoryPreferredSymbol: string | null = null;

    if (!timeframes.length) {
      timeframes = ensureAllowedTimeframes(fallbackTimeframes);
    } else {
      timeframes = ensureAllowedTimeframes(timeframes);
    }

    const selectedSymbol = resolveInitialSymbol({
      preferredSymbol: directoryPreferredSymbol,
      symbols,
      positions,
      orders,
      strategies
    });

    const ensuredSymbol =
      selectedSymbol ?? directoryPreferredSymbol ?? symbols[0]?.symbol ?? null;

    symbols = ensureSymbolList(symbols, ensuredSymbol);

    const normalizedPositions = normalizePositionsWithSymbols(positions, symbols);
    if (normalizedPositions !== positions) {
      positions = normalizedPositions;
    }

    if (!positionsOffline) {
      thunkAPI.dispatch(setPositions(positions));
    }

    const selectedTimeframe =
      timeframes.find((item) => item.value === preferredDefaultTimeframe)?.value ??
      timeframes[0]?.value ??
      fallbackTimeframes.find((item) => item.value === preferredDefaultTimeframe)?.value ??
      fallbackTimeframes[0].value;

    let marketKline: DashboardData['marketKline'] = null;
    let marketAvailability: DashboardData['marketAvailability'] = null;
    let marketTicker: DashboardData['marketTicker'] = null;

    if (selectedSymbol && selectedTimeframe) {
      let marketSnapshot: MarketSnapshotResult | null = null;
      try {
        const state = thunkAPI.getState();
        const clientId = state.realtime.clientId ?? null;
        marketSnapshot = await loadMarketSnapshot(token, {
          symbol: selectedSymbol,
          timeframe: selectedTimeframe,
          durationSeconds: resolveDurationSeconds(preferredDefaultDuration) ?? undefined,
          ownerId: clientId ? `ws:${clientId}` : undefined
        });
      } catch (error) {
        if (error instanceof MarketApiError && error.status === 503) {
          // 行情服务暂不可用，保留空快照
        } else {
          console.warn('加载行情快照失败，将使用空图表：', error);
        }
      }
      if (marketSnapshot) {
        marketKline = marketSnapshot.kline ?? null;
        marketAvailability = marketSnapshot.availability ?? null;
        marketTicker = marketSnapshot.ticker ?? null;
      }
    }

    const snapshot: DashboardData = {
      account,
      accountWarning: serviceWarning ?? null,
      positions,
      orders,
      riskRules,
      strategies,
      notifications,
      depth: createDepthSnapshot(selectedSymbol),
      symbols,
      selectedSymbol: selectedSymbol ?? '',
      timeframes,
      selectedTimeframe,
      marketKline,
      marketAvailability,
      marketTicker
    };

    return { snapshot, user, notificationsOverview };
  }
);

export const __TESTING__ = {
  resolveInitialSymbol
};
