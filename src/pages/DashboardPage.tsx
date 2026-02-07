import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from 'react-redux';
import AccountSummaryCard from '@features/dashboard/components/AccountSummaryCard';
import type {
  AccountAnalyticsPoint,
  AccountAnalyticsRange,
  AccountAnalyticsSeriesMap,
  AccountSummary,
  PositionItem,
  RiskRuleItem,
  StrategyPerformanceSnapshot
} from '@features/dashboard/types';
import PositionsPanel from '@features/dashboard/components/PositionsPanel';
import OrdersPanel from '@features/dashboard/components/OrdersPanel';
import RiskRulesPanel from '@features/dashboard/components/RiskRulesPanel';
import StrategiesPanel from '@features/dashboard/components/StrategiesPanel';
import MarketMonitorPanel from '@features/dashboard/components/MarketMonitorPanel';
import LoadingIndicator from '@components/layout/LoadingIndicator';
import RouteError from '@components/layout/RouteError';
import StrategyDetailModal from '@components/modals/StrategyDetailModal';
import StrategyEditorModal from '@components/modals/StrategyEditorModal';
import OrderDetailModal from '@components/modals/OrderDetailModal';
import OrderEntryModal from '@components/modals/OrderEntryModal';
import RiskRuleDetailModal from '@components/modals/RiskRuleDetailModal';
import RiskRuleEditorModal, { type RiskRuleEditorContext } from '@components/modals/RiskRuleEditorModal';
import AccountAnalyticsModal from '@components/modals/AccountAnalyticsModal';
import { AccountRealtimeClient } from '@services/accountRealtime';
import { MarketRealtimeClient } from '@services/marketRealtime';
import { resolveDurationSeconds } from '@services/marketApi';
import { RiskRealtimeClient } from '@services/riskRealtime';
import NotificationsRealtimeClient from '@services/notificationsRealtime';
import { StrategyRealtimeClient } from '@services/strategyRealtime';
import { useAppDispatch, useAppSelector } from '@store/hooks';
import type { RootState } from '@store/index';
import { initializeDashboard } from '@store/thunks/initializeDashboard';
import { fetchMarketSnapshot } from '@store/thunks/fetchMarketSnapshot';
import { setSelectedSymbol, setSelectedTimeframe, updateDepthSnapshot } from '@store/slices/marketSlice';
import { fetchNotifications, acknowledgeNotificationById } from '@store/thunks/notifications';
import { refreshAccountSummary, refreshAccountPositions } from '@store/thunks/account';
import {
  cancelOrderById,
  closePosition,
  fetchOrders,
  reversePosition,
  submitOrder,
  syncOrdersWithBroker
} from '@store/thunks/orders';
import { ORDERS_DEFAULT_PAGE_SIZE } from '@utils/constants';
import type { CreateOrderArgs } from '@store/thunks/orders';
import { loadRiskOverview } from '@store/thunks/loadRiskOverview';
import {
  saveRiskRule,
  type SaveRiskRuleArgs
} from '@store/thunks/riskRules';
import {
  loadStrategies,
  loadStrategyTemplates,
  loadStrategyFiles,
  startStrategy,
  stopStrategy,
  deleteStrategy,
  createStrategy,
  updateStrategy,
  type SaveStrategyArgs
} from '@store/thunks/strategies';
import styles from './DashboardPage.module.css';
import { resetOrderCreation } from '@store/slices/ordersSlice';
import { resetRiskRuleSave } from '@store/slices/riskSlice';
import { resetStrategySave, selectStrategy } from '@store/slices/strategiesSlice';
import { setMonitorActive as setMonitorActiveAction } from '@store/slices/monitorSlice';
import type { UpsertRiskRuleInput } from '@services/riskApi';
import { computeRiskTargets } from '../utils/riskDefaults';
import { toUpsertInputFromRule } from '../utils/riskRules';
import useOrdersRealtime from '../hooks/useOrdersRealtime';
import DashboardOverview from '@pages/Dashboard';
import { useTranslation } from 'react-i18next';
const ANALYTICS_RANGE_DAYS: Record<AccountAnalyticsRange, number> = {
  '1m': 30,
  '3m': 90,
  '1y': 365
};

const buildSyntheticAccountAnalytics = (account: AccountSummary | null): AccountAnalyticsPoint[] => {
  const totalDays = ANALYTICS_RANGE_DAYS['1y'];
  const targetEquity = account?.equity ?? 1_000_000;
  const equityFloor = Math.max(targetEquity * 0.72, targetEquity - Math.max(targetEquity * 0.28, 320_000));

  const targetPnl = account ? account.pnlRealized + account.pnlUnrealized : targetEquity * 0.12;
  const pnlMagnitude = Math.max(Math.abs(targetPnl), targetEquity * 0.08);
  const pnlStart = targetPnl - pnlMagnitude * 0.4;

  const startDate = new Date();
  startDate.setUTCHours(0, 0, 0, 0);
  startDate.setUTCDate(startDate.getUTCDate() - (totalDays - 1));

  return Array.from({ length: totalDays }, (_, index) => {
    const progress = totalDays <= 1 ? 1 : index / (totalDays - 1);
    const pointDate = new Date(startDate);
    pointDate.setUTCDate(startDate.getUTCDate() + index);

    const seasonal = Math.sin(progress * Math.PI * 4);
    const wave = Math.sin(index * 0.21);
    const swing = Math.cos(index * 0.13);

    const equityTrend = equityFloor + (targetEquity - equityFloor) * progress;
    const equityNoise = seasonal * targetEquity * 0.035 + wave * targetEquity * 0.02;
    const equity = Math.max(0, equityTrend + equityNoise);

    const pnlTrend = pnlStart + (targetPnl - pnlStart) * progress;
    const pnlNoise = seasonal * pnlMagnitude * 0.18 + swing * pnlMagnitude * 0.12;
    const pnl = pnlTrend + pnlNoise;

    return {
      date: pointDate.toISOString(),
      equity,
      pnl
    };
  });
};

const buildAccountAnalyticsSeries = (account: AccountSummary | null): AccountAnalyticsSeriesMap => {
  const baseSeries = buildSyntheticAccountAnalytics(account);
  const dailySeries = baseSeries.map((point, index) => {
    const previous = index > 0 ? baseSeries[index - 1] : null;
    const dailyPnl = previous ? point.pnl - previous.pnl : point.pnl;
    return { ...point, pnl: dailyPnl };
  });
  const sliceLast = (days: number) => dailySeries.slice(-Math.min(days, dailySeries.length));
  return {
    '1m': sliceLast(ANALYTICS_RANGE_DAYS['1m']),
    '3m': sliceLast(ANALYTICS_RANGE_DAYS['3m']),
    '1y': sliceLast(ANALYTICS_RANGE_DAYS['1y'])
  };
};

function DashboardPage() {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const store = useStore<RootState>();

  const accountSummary = useAppSelector((state) => state.account.summary);
  const positions = useAppSelector((state) => state.account.positions);
  const accountStatus = useAppSelector((state) => state.account.status);
  const accountWarning = useAppSelector((state) => state.account.serviceWarning);
  const ordersState = useAppSelector((state) => state.orders);
  const orders = useMemo(() => ordersState.items, [ordersState.items]);
  const riskState = useAppSelector((state) => state.risk);
  const riskRules = riskState.rules;
  const strategies = useAppSelector((state) => state.strategies.items);
  const strategiesStatus = useAppSelector((state) => state.strategies.status);
  const strategyMetricsMap = useAppSelector((state) => state.strategies.metrics);
  const strategyPerformanceMap = useAppSelector((state) => state.strategies.performance);
  const strategyRuntimeMap = useAppSelector((state) => state.strategies.runtime);
  const strategyPerformanceSnapshots = useMemo<Record<string, StrategyPerformanceSnapshot | null>>(() => {
    const result: Record<string, StrategyPerformanceSnapshot | null> = {};
    for (const [strategyId, periods] of Object.entries(strategyPerformanceMap)) {
      if (!periods) {
        result[strategyId] = null;
        continue;
      }
      const preferred =
        periods['day'] ?? Object.values(periods).find((snapshot) => snapshot) ?? null;
      result[strategyId] = preferred ?? null;
    }
    return result;
  }, [strategyPerformanceMap]);
  const strategiesFallbackMode = useAppSelector((state) => state.strategies.fallbackMode);
  const strategyTemplates = useAppSelector((state) => state.strategies.templates);
  const strategyTemplatesStatus = useAppSelector((state) => state.strategies.templatesStatus);
  const strategyFiles = useAppSelector((state) => state.strategies.files);
  const strategyFilesStatus = useAppSelector((state) => state.strategies.filesStatus);
  const strategySaveStatus = useAppSelector((state) => state.strategies.saveStatus);
  const strategySaveError = useAppSelector((state) => state.strategies.saveError ?? null);
  const depth = useAppSelector((state) => state.market.depth);
  const symbols = useAppSelector((state) => state.market.symbols);
  const selectedSymbol = useAppSelector((state) => state.market.selectedSymbol);
  const timeframes = useAppSelector((state) => state.market.timeframes);
  const selectedTimeframe = useAppSelector((state) => state.market.selectedTimeframe);
  const kline = useAppSelector((state) => state.market.kline);
  const availability = useAppSelector((state) => state.market.availability);
  const ticker = useAppSelector((state) => state.market.ticker);
  const marketStatus = useAppSelector((state) => state.market.status);
  const marketError = useAppSelector((state) => state.market.error);
  const marketSubscription = useAppSelector((state) => state.market.subscription);
  const notificationsState = useAppSelector((state) => state.notifications);
  const notificationsStatus = notificationsState.status;
  const monitorActive = useAppSelector((state) => state.monitor.active);
  const monitorDuration = useAppSelector((state) => state.monitor.duration);
  const token = useAppSelector((state) => state.auth.token);

  const fallbackTimeframe = useMemo(
    () => selectedTimeframe ?? timeframes[0]?.value ?? '5m',
    [selectedTimeframe, timeframes]
  );
  const fallbackDuration = useMemo(() => monitorDuration ?? '1D', [monitorDuration]);
  const [chartTimeframe, setChartTimeframe] = useState<string>(fallbackTimeframe);
  const [chartDuration, setChartDuration] = useState<string>(fallbackDuration);

  useEffect(() => {
    const available = new Set(timeframes.map((item) => item.value));
    setChartTimeframe((previous) => {
      if (!previous) {
        return fallbackTimeframe;
      }
      if (available.size > 0 && !available.has(previous)) {
        return fallbackTimeframe;
      }
      return previous;
    });
  }, [fallbackTimeframe, timeframes]);

  useEffect(() => {
    setChartDuration((previous) => {
      if (previous) {
        const resolved = resolveDurationSeconds(previous);
        if (resolved != null) {
          return previous;
        }
      }
      return fallbackDuration;
    });
  }, [fallbackDuration]);

  const chartDurationSeconds = useMemo(() => {
    const resolved = resolveDurationSeconds(chartDuration);
    if (resolved != null) {
      return resolved;
    }
    const fallbackResolved = resolveDurationSeconds(fallbackDuration);
    return fallbackResolved ?? undefined;
  }, [chartDuration, fallbackDuration]);

  const effectiveSymbol = useMemo(() => selectedSymbol ?? symbols[0]?.symbol ?? '', [selectedSymbol, symbols]);
  const selectedPosition = useMemo(
    () => positions.find((item) => item.symbol === effectiveSymbol) ?? null,
    [positions, effectiveSymbol]
  );
  const inlineRiskRule = useMemo(() => {
    const matched = riskRules.find((rule) => rule.symbol === effectiveSymbol);
    if (matched) {
      return matched;
    }
    return riskRules.find((rule) => !rule.symbol) ?? null;
  }, [riskRules, effectiveSymbol]);

  const accountAnalyticsData = useMemo(
    () => buildAccountAnalyticsSeries(accountSummary),
    [accountSummary]
  );

  const ordersReady = ordersState.status === 'succeeded' || ordersState.status === 'loading';
  const notificationsReady = notificationsStatus === 'succeeded' || notificationsStatus === 'loading';

  useOrdersRealtime({ enabled: ordersReady });

  const chartTimeframeRef = useRef<string | null>(chartTimeframe || null);
  const chartDurationSecondsRef = useRef<number | null>(chartDurationSeconds ?? null);
  const marketRealtimeRef = useRef<MarketRealtimeClient | null>(null);
  const riskRealtimeRef = useRef<RiskRealtimeClient | null>(null);
  const notificationsRealtimeRef = useRef<NotificationsRealtimeClient | null>(null);
  const strategyRealtimeRef = useRef<StrategyRealtimeClient | null>(null);

  const [selectedOrder, setSelectedOrder] = useState<typeof orders[number] | null>(null);
  const [selectedRiskRule, setSelectedRiskRule] = useState<typeof riskRules[number] | null>(null);
  const [riskRuleEditorOpen, setRiskRuleEditorOpen] = useState(false);
  const [editingRiskRule, setEditingRiskRule] = useState<typeof riskRules[number] | null>(null);
  const [riskRuleDraft, setRiskRuleDraft] = useState<Partial<UpsertRiskRuleInput> | null>(null);
  const [riskRuleContext, setRiskRuleContext] = useState<RiskRuleEditorContext | null>(null);
  const [strategyModalOpen, setStrategyModalOpen] = useState(false);
  const [strategyEditorOpen, setStrategyEditorOpen] = useState(false);
  const [editingStrategy, setEditingStrategy] = useState<typeof strategies[number] | null>(null);
  const [strategyDetailId, setStrategyDetailId] = useState<string | null>(null);
  const [orderEntryOpen, setOrderEntryOpen] = useState(false);
  const [orderEntrySymbol, setOrderEntrySymbol] = useState<string>('');
  const orderEntrySubmissionRef = useRef(false);
  const [accountAnalyticsOpen, setAccountAnalyticsOpen] = useState(false);
  const [subscriptionNotice, setSubscriptionNotice] = useState<string | null>(null);

  const orderCreationStatus = ordersState.submitStatus;
  const orderCreationError = ordersState.submitError ?? null;
  const positionCloseStatus = ordersState.positionCloseStatus;
  const positionCloseError = ordersState.positionCloseError ?? null;
  const positionReverseStatus = ordersState.positionReverseStatus;
  const positionReverseError = ordersState.positionReverseError ?? null;
  const riskRuleSaveStatus = riskState.saveStatus;
  const riskRuleSaveError = riskState.saveError ?? null;

  useEffect(() => {
    chartTimeframeRef.current = chartTimeframe || null;
  }, [chartTimeframe]);

  useEffect(() => {
    chartDurationSecondsRef.current = chartDurationSeconds ?? null;
  }, [chartDurationSeconds]);

  useEffect(() => {
    if (accountStatus === 'idle' && token) {
      void dispatch(initializeDashboard());
    }
  }, [accountStatus, dispatch, token]);

  useEffect(() => {
    if (accountStatus === 'succeeded' && ordersState.status === 'idle' && token) {
      void dispatch(fetchOrders({ page: ordersState.page, pageSize: ordersState.pageSize }));
    }
  }, [accountStatus, dispatch, ordersState.page, ordersState.pageSize, ordersState.status, token]);

  useEffect(() => {
    if (accountStatus !== 'succeeded' || marketStatus !== 'succeeded' || !token) {
      return;
    }
    const realtime = new AccountRealtimeClient({
      dispatch,
      tokenProvider: () => store.getState().auth.token
    });
    void realtime.connect();
    return () => {
      void realtime.disconnect();
    };
  }, [accountStatus, marketStatus, dispatch, store, token]);

  useEffect(() => {
    if (marketStatus !== 'succeeded' || !token || !monitorActive) {
      if (marketRealtimeRef.current) {
        void marketRealtimeRef.current.disconnect();
        marketRealtimeRef.current = null;
      }
      return;
    }
    if (marketRealtimeRef.current) {
      return;
    }
    const client = new MarketRealtimeClient({
      dispatch,
      tokenProvider: () => store.getState().auth.token,
      symbolProvider: () => store.getState().market.selectedSymbol ?? null,
      timeframeProvider: () =>
        chartTimeframeRef.current ?? store.getState().market.selectedTimeframe ?? null,
      durationProvider: () => {
        const duration = chartDurationSecondsRef.current;
        if (duration != null) {
          return duration;
        }
        const state = store.getState();
        const resolved = resolveDurationSeconds(state.monitor.duration ?? null);
        return resolved ?? null;
      },
      symbolMetadataProvider: (symbol) => {
        const state = store.getState();
        const symbolsList = state.market.symbols ?? [];
        const fallbackSymbol = symbol ?? state.market.selectedSymbol ?? null;
        if (!fallbackSymbol) {
          return null;
        }
        const normalized = fallbackSymbol.toUpperCase();
        const direct = symbolsList.find((item) => item.symbol.toUpperCase() === normalized);
        const root = normalized.replace(/\d+.*/, '');
        const fallback = root ? symbolsList.find((item) => item.symbol.toUpperCase() === root) : null;
        if (!direct && !fallback) {
          return null;
        }
        if (direct && fallback && fallback !== direct) {
          return {
            ...fallback,
            ...direct,
            tickSize: direct.tickSize ?? fallback.tickSize ?? null,
            secType: direct.secType ?? fallback.secType ?? null,
            domCapable: false,
            exchange: direct.exchange || fallback.exchange
          };
        }
        const base = direct ?? fallback ?? null;
        return base ? { ...base, domCapable: false } : null;
      }
    });
    marketRealtimeRef.current = client;
    void client.connect();
    return () => {
      if (marketRealtimeRef.current === client) {
        marketRealtimeRef.current = null;
      }
      void client.disconnect();
    };
  }, [dispatch, marketStatus, monitorActive, store, token]);

  useEffect(() => {
    const timeframeForSubscription = chartTimeframe || selectedTimeframe;
    if (!monitorActive || !selectedSymbol || !timeframeForSubscription) {
      return;
    }
    marketRealtimeRef.current?.refreshSubscription();
  }, [chartTimeframe, monitorActive, selectedSymbol, selectedTimeframe]);

  const formatSubscriptionNotice = useCallback((symbolHint?: string | null, timeframeHint?: string | null) => {
    const detail = [symbolHint, timeframeHint]
      .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
      .join(' · ');
    return detail ? `等待订阅 ${detail}` : '等待订阅实时行情';
  }, []);

  useEffect(() => {
    if (marketSubscription.status === 'pending') {
      const symbolHint =
        marketSubscription.metadata?.symbol ?? selectedSymbol ?? symbols[0]?.symbol ?? null;
      const timeframeHint =
        marketSubscription.metadata?.timeframe ??
        chartTimeframe ??
        selectedTimeframe ??
        timeframes[0]?.value ??
        null;
      setSubscriptionNotice(formatSubscriptionNotice(symbolHint, timeframeHint));
    } else {
      setSubscriptionNotice(null);
    }
  }, [
    formatSubscriptionNotice,
    marketSubscription.metadata?.symbol,
    marketSubscription.metadata?.timeframe,
    marketSubscription.status,
    chartTimeframe,
    selectedSymbol,
    selectedTimeframe,
    symbols,
    timeframes
  ]);

  useEffect(() => {
    if (accountStatus !== 'succeeded' || !token) {
      return;
    }
    const client = new RiskRealtimeClient({
      dispatch,
      tokenProvider: () => store.getState().auth.token
    });
    riskRealtimeRef.current = client;
    void client.connect();
    return () => {
      riskRealtimeRef.current = null;
      void client.disconnect();
    };
  }, [accountStatus, dispatch, store, token]);

  useEffect(() => {
    if (!strategyEditorOpen) {
      return;
    }
    if (strategyTemplatesStatus === 'idle') {
      void dispatch(loadStrategyTemplates());
    }
  }, [dispatch, strategyEditorOpen, strategyTemplatesStatus]);

  useEffect(() => {
    if (!strategyEditorOpen) {
      return;
    }
    if (strategyFilesStatus === 'idle') {
      void dispatch(loadStrategyFiles());
    }
  }, [dispatch, strategyEditorOpen, strategyFilesStatus]);

  useEffect(() => {
    if (!strategyEditorOpen) {
      return;
    }
    if (strategySaveStatus === 'succeeded') {
      setStrategyEditorOpen(false);
      setEditingStrategy(null);
      dispatch(resetStrategySave());
    }
  }, [dispatch, strategyEditorOpen, strategySaveStatus]);

  useEffect(() => {
    if (!token || !notificationsReady) {
      if (notificationsRealtimeRef.current) {
        void notificationsRealtimeRef.current.disconnect();
        notificationsRealtimeRef.current = null;
      }
      return;
    }
    if (notificationsRealtimeRef.current) {
      return;
    }
    const client = new NotificationsRealtimeClient({
      dispatch,
      tokenProvider: () => store.getState().auth.token
    });
    notificationsRealtimeRef.current = client;
    void client.connect();
    return () => {
      void client.disconnect();
      if (notificationsRealtimeRef.current === client) {
        notificationsRealtimeRef.current = null;
      }
    };
  }, [dispatch, notificationsReady, store, token]);

  useEffect(() => {
    if (!token) {
      if (strategyRealtimeRef.current) {
        void strategyRealtimeRef.current.disconnect();
        strategyRealtimeRef.current = null;
      }
      return;
    }

    if (strategyRealtimeRef.current || strategiesStatus === 'loading') {
      return;
    }

    const client = new StrategyRealtimeClient({
      dispatch,
      tokenProvider: () => store.getState().auth.token,
      stateProvider: () => store.getState()
    });
    strategyRealtimeRef.current = client;
    void client.connect();

    return () => {
      void client.disconnect();
      if (strategyRealtimeRef.current === client) {
        strategyRealtimeRef.current = null;
      }
    };
  }, [dispatch, store, strategiesStatus, token]);

  useEffect(() => {
    if (!monitorActive || !selectedSymbol || !chartTimeframe || !token) {
      return;
    }
    void dispatch(
      fetchMarketSnapshot({
        symbol: selectedSymbol,
        timeframe: chartTimeframe,
        durationSeconds: chartDurationSeconds,
        refreshAvailability: true
      })
    );
  }, [chartDurationSeconds, chartTimeframe, dispatch, monitorActive, selectedSymbol, token]);

  useEffect(() => {
    if (notificationsStatus === 'idle' && token) {
      void dispatch(fetchNotifications({ limit: 30 }));
    }
  }, [dispatch, notificationsStatus, token]);

  useEffect(() => {
    if (!orderEntryOpen || !orderEntrySubmissionRef.current) {
      return;
    }
    if (orderCreationStatus === 'succeeded') {
      setOrderEntryOpen(false);
      setOrderEntrySymbol('');
      orderEntrySubmissionRef.current = false;
      dispatch(resetOrderCreation());
    } else if (orderCreationStatus === 'failed') {
      orderEntrySubmissionRef.current = false;
    }
  }, [dispatch, orderEntryOpen, orderCreationStatus]);

  useEffect(() => {
    if (!riskRuleEditorOpen) {
      return;
    }
    if (riskRuleSaveStatus === 'succeeded') {
      setRiskRuleEditorOpen(false);
      setEditingRiskRule(null);
      setRiskRuleDraft(null);
      setRiskRuleContext(null);
      dispatch(resetRiskRuleSave());
    }
  }, [dispatch, riskRuleEditorOpen, riskRuleSaveStatus]);

  const handleSelectSymbol = useCallback(
    (symbol: string) => {
      dispatch(setMonitorActiveAction(true));

      if (marketSubscription.status !== 'ready') {
        marketRealtimeRef.current?.refreshSubscription();
        setSubscriptionNotice(
          formatSubscriptionNotice(symbol, chartTimeframe ?? timeframes[0]?.value ?? null)
        );
      }

      if (symbol === selectedSymbol) {
        if (chartTimeframe) {
          void dispatch(
            fetchMarketSnapshot({
              symbol,
              timeframe: chartTimeframe,
              durationSeconds: chartDurationSeconds,
              refreshAvailability: true
            })
          );
        }
      } else {
        dispatch(
          updateDepthSnapshot({
            symbol,
            bids: [],
            asks: [],
            midPrice: null,
            spread: null,
            updatedAt: new Date().toISOString()
          })
        );
        dispatch(setSelectedSymbol(symbol));
      }
    },
    [
      chartDurationSeconds,
      chartTimeframe,
      dispatch,
      formatSubscriptionNotice,
      marketSubscription.status,
      selectedSymbol,
      timeframes
    ]
  );

  const handleTimeframeChange = useCallback(
    (timeframe: string) => {
      dispatch(setMonitorActiveAction(true));
      setChartTimeframe(timeframe);
      dispatch(setSelectedTimeframe(timeframe));

      if (marketSubscription.status !== 'ready') {
        setSubscriptionNotice(
          formatSubscriptionNotice(selectedSymbol ?? symbols[0]?.symbol ?? null, timeframe ?? null)
        );
      }
    },
    [dispatch, formatSubscriptionNotice, marketSubscription.status, selectedSymbol, symbols]
  );

  const handleToggleMonitor = useCallback(() => {
    const next = !monitorActive;
    dispatch(setMonitorActiveAction(next));
    if (next && selectedSymbol && chartTimeframe) {
      void dispatch(
        fetchMarketSnapshot({
          symbol: selectedSymbol,
          timeframe: chartTimeframe,
          durationSeconds: chartDurationSeconds,
          refreshAvailability: true
        })
      );
    }
  }, [chartDurationSeconds, chartTimeframe, dispatch, monitorActive, selectedSymbol]);

  const handleDurationChange = useCallback((duration: string) => {
    setChartDuration(duration);
  }, []);

  const handleRefreshMonitor = useCallback(() => {
    if (!selectedSymbol || !chartTimeframe) {
      return;
    }
    void dispatch(
      fetchMarketSnapshot({
        symbol: selectedSymbol,
        timeframe: chartTimeframe,
        durationSeconds: chartDurationSeconds,
        refreshAvailability: true
      })
    );
  }, [chartDurationSeconds, chartTimeframe, dispatch, selectedSymbol]);

  const handleRetryRealtimeConnection = useCallback(() => {
    const client = marketRealtimeRef.current;
    if (!client) {
      return;
    }
    void client.connect({ force: true });
  }, []);

  const handleRefreshAccount = useCallback(() => {
    void dispatch(refreshAccountSummary());
  }, [dispatch]);

  const handleRefreshPositions = useCallback(() => {
    void dispatch(refreshAccountPositions());
  }, [dispatch]);

  const handleRefreshOrders = useCallback(() => {
    void dispatch(fetchOrders({ page: ordersState.page, pageSize: ORDERS_DEFAULT_PAGE_SIZE }));
  }, [dispatch, ordersState.page]);

  const handleSyncOrders = useCallback(() => {
    void dispatch(syncOrdersWithBroker());
  }, [dispatch]);

  const handleOpenOrderEntry = useCallback(() => {
    dispatch(resetOrderCreation());
    setOrderEntrySymbol(selectedSymbol ?? symbols[0]?.symbol ?? '');
    setOrderEntryOpen(true);
  }, [dispatch, selectedSymbol, symbols]);

  const handleCloseOrderEntry = useCallback(() => {
    setOrderEntryOpen(false);
    setOrderEntrySymbol('');
    orderEntrySubmissionRef.current = false;
    dispatch(resetOrderCreation());
  }, [dispatch]);

  const handleSubmitOrder = useCallback(
    (payload: CreateOrderArgs) => {
      orderEntrySubmissionRef.current = true;
      void dispatch(submitOrder(payload));
    },
    [dispatch]
  );

  const handleCancelOrder = useCallback(
    (order: typeof orders[number]) => {
      void dispatch(
        cancelOrderById({
          id: order.id,
          ibOrderId: order.ibOrderId ?? null,
          clientOrderId: order.clientOrderId ?? null
        })
      );
    },
    [dispatch]
  );

  const handleRefreshRiskRules = useCallback(() => {
    void dispatch(loadRiskOverview());
  }, [dispatch]);

  const buildRiskContext = useCallback(
    (symbol: string | null | undefined): RiskRuleEditorContext | null => {
      if (!symbol) {
        return null;
      }
      const position = positions.find((item) => item.symbol === symbol);
      if (!position) {
        return null;
      }
      const computed = computeRiskTargets({
        symbol: position.symbol,
        avgPrice: position.avgPrice,
        direction: position.direction
      });
      return {
        symbol: position.symbol,
        basePrice: position.avgPrice,
        quantity: position.quantity,
        direction: position.direction,
        multiplier: position.multiplier ?? null,
        leverage: computed?.leverage ?? null,
        recommended: computed
          ? {
              stopLossPrice: computed.stopLossPrice,
              takeProfitPrice: computed.takeProfitPrice,
              stopLossOffset: computed.stopLossOffset,
              takeProfitOffset: computed.takeProfitOffset,
              stopLossRatio: computed.stopLossRatio,
              takeProfitRatio: computed.takeProfitRatio
            }
          : null
      };
    },
    [positions]
  );

  const handleConfigureRiskRule = useCallback(
    (position: typeof positions[number]) => {
      const latestPosition = positions.find((item) => item.symbol === position.symbol) ?? position;
      dispatch(resetRiskRuleSave());
      const existingRule = riskRules.find((rule) => rule.symbol === latestPosition.symbol) ?? null;
      const computed = computeRiskTargets({
        symbol: latestPosition.symbol,
        avgPrice: latestPosition.avgPrice,
        direction: latestPosition.direction
      });

      setRiskRuleContext({
        symbol: latestPosition.symbol,
        basePrice: latestPosition.avgPrice,
        quantity: latestPosition.quantity,
        direction: latestPosition.direction,
        multiplier: latestPosition.multiplier ?? null,
        leverage: computed?.leverage ?? null,
        recommended: computed
          ? {
              stopLossPrice: computed.stopLossPrice,
              takeProfitPrice: computed.takeProfitPrice,
              stopLossOffset: computed.stopLossOffset,
              takeProfitOffset: computed.takeProfitOffset,
              stopLossRatio: computed.stopLossRatio,
              takeProfitRatio: computed.takeProfitRatio
            }
          : null
      });

      if (existingRule) {
        setEditingRiskRule(existingRule);
        setRiskRuleDraft(null);
      } else {
        setEditingRiskRule(null);
        setRiskRuleDraft(
          computed
            ? {
                symbol: latestPosition.symbol,
                enabled: true,
                type: 'fixed',
                stopLossOffset: computed.stopLossOffset,
                takeProfitOffset: computed.takeProfitOffset
              }
            : { symbol: latestPosition.symbol, enabled: true, type: 'fixed' }
        );
      }
      setRiskRuleEditorOpen(true);
    },
    [dispatch, positions, riskRules]
  );

  const handleEditRiskRule = useCallback(
    (rule: typeof riskRules[number]) => {
      dispatch(resetRiskRuleSave());
      setEditingRiskRule(rule);
      setRiskRuleDraft(null);
      setRiskRuleContext(buildRiskContext(rule.symbol ?? null));
      setRiskRuleEditorOpen(true);
    },
    [buildRiskContext, dispatch]
  );

  const handleCloseRiskRuleEditor = useCallback(() => {
    setRiskRuleEditorOpen(false);
    setEditingRiskRule(null);
    setRiskRuleDraft(null);
    setRiskRuleContext(null);
    dispatch(resetRiskRuleSave());
  }, [dispatch]);

  const handleToggleRiskRule = useCallback(
    (rule: typeof riskRules[number]) => {
      dispatch(resetRiskRuleSave());
      const payload = toUpsertInputFromRule(rule, { enabled: !rule.enabled });
      void dispatch(saveRiskRule(payload));
    },
    [dispatch]
  );

  const handleSubmitRiskRule = useCallback(
    (payload: SaveRiskRuleArgs) => {
      void dispatch(saveRiskRule(payload));
    },
    [dispatch]
  );

  const handleToggleInlineRiskRule = useCallback(
    (rule: RiskRuleItem, enabled: boolean) => {
      const payload: SaveRiskRuleArgs =
        rule.type === 'fixed'
          ? {
              ruleId: rule.id,
              symbol: rule.symbol ?? effectiveSymbol,
              enabled,
              type: 'fixed',
              stopLossOffset: rule.stopLossOffset ?? null,
              takeProfitOffset: rule.takeProfitOffset ?? null,
              trailingDistance: rule.trailingDistance ?? null,
              trailingPercent: rule.trailingPercent ?? null,
              maxTimeSpan: rule.maxTimeSpan ?? null,
              positionLimit: rule.positionLimit ?? null,
              lossLimit: rule.lossLimit ?? null,
              notes: rule.notes ?? null,
              atrConfig: rule.atrConfig ?? null
            }
          : {
              ruleId: rule.id,
              symbol: rule.symbol ?? effectiveSymbol,
              enabled,
              type: 'trailing',
              trailingDistance: rule.trailingDistance ?? null,
              trailingPercent: rule.trailingPercent ?? null,
              maxTimeSpan: rule.maxTimeSpan ?? null,
              positionLimit: rule.positionLimit ?? null,
              lossLimit: rule.lossLimit ?? null,
              notes: rule.notes ?? null,
              atrConfig: rule.atrConfig ?? null
            };
      void dispatch(saveRiskRule(payload));
    },
    [dispatch, effectiveSymbol]
  );

  const handleQuickClosePosition = useCallback(
    (symbol: string, _target: PositionItem) => {
      void _target;
      if (!symbol) {
        return;
      }
      void dispatch(closePosition({ symbol }));
    },
    [dispatch]
  );

  const handleQuickReversePosition = useCallback(
    (symbol: string, _target: PositionItem) => {
      void _target;
      if (!symbol) {
        return;
      }
      void dispatch(reversePosition({ symbol }));
    },
    [dispatch]
  );

  const handleInspectStrategy = useCallback(
    (strategy: typeof strategies[number]) => {
      setStrategyDetailId(strategy.id);
      setStrategyModalOpen(true);
      dispatch(selectStrategy(strategy.id));
    },
    [dispatch]
  );

  const handleToggleStrategy = useCallback(
    (strategy: typeof strategies[number]) => {
      if (strategy.status === 'running') {
        void dispatch(stopStrategy({ strategyId: strategy.id }));
      } else {
        void dispatch(startStrategy({ strategyId: strategy.id }));
      }
    },
    [dispatch]
  );

  const handleRefreshStrategies = useCallback(() => {
    void dispatch(loadStrategies({ refresh: true }));
  }, [dispatch]);

  const handleDeleteStrategy = useCallback(
    (strategyId: string) => {
      void dispatch(deleteStrategy({ strategyId }));
      setStrategyModalOpen(false);
      setStrategyDetailId(null);
    },
    [dispatch]
  );

  const handleCreateStrategy = useCallback(() => {
    dispatch(resetStrategySave());
    setEditingStrategy(null);
    setStrategyEditorOpen(true);
    if (strategyTemplatesStatus === 'idle') {
      void dispatch(loadStrategyTemplates());
    }
  }, [dispatch, strategyTemplatesStatus]);

  const handleEditStrategy = useCallback(
    (strategy: typeof strategies[number]) => {
      dispatch(resetStrategySave());
      setEditingStrategy(strategy);
      setStrategyEditorOpen(true);
      if (strategyTemplatesStatus === 'idle') {
        void dispatch(loadStrategyTemplates());
      }
    },
    [dispatch, strategyTemplatesStatus]
  );

  const handleCloseStrategyEditor = useCallback(() => {
    setStrategyEditorOpen(false);
    setEditingStrategy(null);
    dispatch(resetStrategySave());
  }, [dispatch]);

  const handleSubmitStrategy = useCallback(
    (payload: SaveStrategyArgs) => {
      if (payload.id) {
        void dispatch(updateStrategy(payload));
      } else {
        void dispatch(createStrategy(payload));
      }
    },
    [dispatch]
  );

  const handleRefreshStrategyTemplates = useCallback(() => {
    void dispatch(loadStrategyTemplates());
  }, [dispatch]);

  const handleRefreshStrategyFiles = useCallback(() => {
    void dispatch(loadStrategyFiles());
  }, [dispatch]);

  

  const handleOpenAccountAnalytics = useCallback(() => {
    setAccountAnalyticsOpen(true);
  }, []);

  const handleCloseAccountAnalytics = useCallback(() => {
    setAccountAnalyticsOpen(false);
  }, []);

  const selectedStrategy = useMemo(
    () => strategies.find((strategy) => strategy.id === strategyDetailId) ?? null,
    [strategies, strategyDetailId]
  );

  const strategyMetrics = useMemo(() => {
    if (!strategyDetailId) {
      return selectedStrategy?.metricsSnapshot ?? null;
    }
    return strategyMetricsMap[strategyDetailId] ?? selectedStrategy?.metricsSnapshot ?? null;
  }, [strategyDetailId, strategyMetricsMap, selectedStrategy]);

  const strategyPerformance = useMemo(() => {
    if (!strategyDetailId) {
      return selectedStrategy?.performanceSnapshot ?? null;
    }
    const periods = strategyPerformanceMap[strategyDetailId] ?? null;
    if (!periods) {
      return selectedStrategy?.performanceSnapshot ?? null;
    }
    return (
      periods['day'] ??
      Object.values(periods).find((snapshot) => snapshot) ??
      selectedStrategy?.performanceSnapshot ??
      null
    );
  }, [strategyDetailId, strategyPerformanceMap, selectedStrategy]);

  const accountReady = Boolean(accountSummary);
  const marketReady = Boolean(depth);
  const accountLoading = (accountStatus === 'idle' || accountStatus === 'loading') && !accountReady;
  const marketLoading = (marketStatus === 'idle' || marketStatus === 'loading') && !marketReady;

  if (accountLoading || marketLoading) {
    return <LoadingIndicator message={t('dashboard.loading')} />;
  }

  if (accountStatus === 'failed' || marketStatus === 'failed') {
    return <RouteError status={500} message={marketError ?? t('dashboard.error_load_failed')} />;
  }

  if (!accountReady || !marketReady) {
    return <RouteError status={500} message={t('dashboard.error_data_missing')} />;
  }

  return (
    <div className={styles.page}>
      <DashboardOverview token={token} />
      {(() => {
        const item = notificationsState.items.find((n) => !n.read && (n.event === 'GLOBAL_TRADING_HALTED'));
        if (!item) return null;
        return (
          <div className={styles.accountWarningBanner} role="alert">
            {item.title || '全局风控暂停'}：{item.message}
            <button
              className={styles.secondaryButton}
              style={{ marginLeft: '0.75rem' }}
              onClick={() => void dispatch(acknowledgeNotificationById(item.id))}
            >我知道了</button>
          </div>
        );
      })()}
      {accountWarning ? (
        <div className={styles.accountWarningBanner} role="status">
          {t('dashboard.account_warning_prefix')}{accountWarning}
        </div>
      ) : null}
      <div className={styles.layout} data-has-chart={monitorActive ? 'true' : 'false'}>
        <div className={styles.leftColumn}>
          <AccountSummaryCard
            account={accountSummary!}
            onRefresh={handleRefreshAccount}
            onViewAnalytics={handleOpenAccountAnalytics}
          />
          <PositionsPanel
            positions={positions}
            symbols={symbols}
            onSelectSymbol={handleSelectSymbol}
            onConfigureRiskRule={handleConfigureRiskRule}
            onQuickClosePosition={handleQuickClosePosition}
            onQuickReversePosition={handleQuickReversePosition}
            onRefresh={handleRefreshPositions}
            quickCloseStatus={positionCloseStatus}
            quickCloseError={positionCloseError}
            quickReverseStatus={positionReverseStatus}
            quickReverseError={positionReverseError}
          />
          <RiskRulesPanel
            rules={riskRules}
            onViewRule={(rule) => {
              if (rule.symbol) {
                handleSelectSymbol(rule.symbol);
              } else {
                setSelectedRiskRule(rule);
              }
            }}
            onEditRule={handleEditRiskRule}
            onToggleRule={handleToggleRiskRule}
            onRefresh={handleRefreshRiskRules}
          />
        </div>
        <div className={styles.centerColumn}>
          <OrdersPanel
            orders={orders}
            onSelectSymbol={handleSelectSymbol}
            onViewDetail={setSelectedOrder}
            onCancel={handleCancelOrder}
            onRefresh={handleRefreshOrders}
            onSync={handleSyncOrders}
            syncInProgress={ordersState.syncStatus === 'loading'}
            lastUpdated={ordersState.lastUpdated}
            onCreateOrder={handleOpenOrderEntry}
          />
          <StrategiesPanel
            strategies={strategies}
            onInspect={handleInspectStrategy}
            onEdit={handleEditStrategy}
            onToggle={handleToggleStrategy}
            onCreate={handleCreateStrategy}
            onRefresh={handleRefreshStrategies}
            metricsById={strategyMetricsMap}
            performanceById={strategyPerformanceSnapshots}
            runtimeById={strategyRuntimeMap}
            onSelectSymbol={handleSelectSymbol}
          />
        </div>
        {monitorActive ? (
          <div className={styles.rightColumn}>
            <MarketMonitorPanel
              symbols={symbols}
              selectedSymbol={effectiveSymbol}
              timeframes={timeframes}
              selectedTimeframe={chartTimeframe}
              bars={kline?.bars ?? []}
              ticker={ticker ?? null}
              availability={availability ?? null}
              subscription={marketSubscription}
              connectionStatus={marketSubscription.connectionStatus}
              subscriptionNotice={subscriptionNotice}
              monitorActive={monitorActive}
              selectedDuration={chartDuration}
              position={selectedPosition}
              riskRule={inlineRiskRule}
              riskRuleSaving={riskRuleSaveStatus === 'loading'}
              lastSavedRuleId={riskState.lastSavedRuleId}
              onSymbolChange={handleSelectSymbol}
              onTimeframeChange={handleTimeframeChange}
              onToggleMonitor={handleToggleMonitor}
              onRefresh={handleRefreshMonitor}
              onDurationChange={handleDurationChange}
              onSaveRiskRule={handleSubmitRiskRule}
              onToggleRiskRule={handleToggleInlineRiskRule}
              onRetryConnection={handleRetryRealtimeConnection}
            />
          </div>
        ) : null}
      </div>
      <AccountAnalyticsModal
        open={accountAnalyticsOpen}
        onClose={handleCloseAccountAnalytics}
        data={accountAnalyticsData}
        currency={accountSummary?.currency}
      />
      <OrderEntryModal
        open={orderEntryOpen}
        symbols={symbols}
        defaultSymbol={orderEntrySymbol || selectedSymbol || symbols[0]?.symbol}
        submitting={orderCreationStatus === 'loading'}
        error={orderCreationError}
        onSubmit={handleSubmitOrder}
        onClose={handleCloseOrderEntry}
      />
      <OrderDetailModal open={Boolean(selectedOrder)} order={selectedOrder} onClose={() => setSelectedOrder(null)} />
      <RiskRuleDetailModal open={Boolean(selectedRiskRule)} rule={selectedRiskRule} onClose={() => setSelectedRiskRule(null)} />
      <RiskRuleEditorModal
        open={riskRuleEditorOpen}
        rule={editingRiskRule}
        defaults={riskRuleDraft}
        context={riskRuleContext}
        submitting={riskRuleSaveStatus === 'loading'}
        error={riskRuleSaveError}
        onSubmit={handleSubmitRiskRule}
        onClose={handleCloseRiskRuleEditor}
      />
      <StrategyEditorModal
        open={strategyEditorOpen}
        strategy={editingStrategy}
        templates={strategyTemplates}
        templatesLoading={strategyTemplatesStatus === 'loading'}
        files={strategyFiles}
        filesLoading={strategyFilesStatus === 'loading'}
        submitting={strategySaveStatus === 'loading'}
        error={strategySaveError}
        onRefreshTemplates={handleRefreshStrategyTemplates}
        onRefreshFiles={handleRefreshStrategyFiles}
        onSubmit={handleSubmitStrategy}
        onClose={handleCloseStrategyEditor}
      />
      <StrategyDetailModal
        open={strategyModalOpen}
        strategy={selectedStrategy}
        metrics={strategyMetrics}
        performance={strategyPerformance}
        fallbackMode={strategiesFallbackMode}
        onDelete={handleDeleteStrategy}
        onClose={() => {
          setStrategyModalOpen(false);
          setStrategyDetailId(null);
        }}
      />
    </div>
  );
}

export default DashboardPage;
