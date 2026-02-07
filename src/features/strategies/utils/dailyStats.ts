import type {
  StrategyItem,
  StrategyMetricsSnapshot,
  StrategyPerformanceSnapshot
} from '@features/dashboard/types';

const parseNumeric = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const normalized = value.replace(/,/g, '');
    const parsed = Number(normalized);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return null;
};

const pickNumericValue = (
  source: Record<string, number | string | null | undefined> | undefined,
  keys: string[]
): number | null => {
  if (!source) {
    return null;
  }
  for (const key of keys) {
    if (key in source) {
      const value = parseNumeric(source[key]);
      if (value !== null) {
        return value;
      }
    }
  }
  return null;
};

interface DailyStatsOptions {
  metrics?: StrategyMetricsSnapshot | null;
  performance?: StrategyPerformanceSnapshot | null;
}

export const getStrategyDailyStats = (
  strategy: StrategyItem,
  options: DailyStatsOptions = {}
) => {
  const metricsSnapshot = options.metrics ?? strategy.metricsSnapshot ?? null;
  const performanceSnapshot = options.performance ?? strategy.performanceSnapshot ?? null;

  const isDailyPerformance = performanceSnapshot?.period === 'day' ? performanceSnapshot : null;

  const pnlKeys = [
    'total_pnl',
    'dailyPnl',
    'daily_pnl',
    'intradayPnl',
    'intraday_pnl',
    'pnl',
    'todayPnl',
    'today_pnl'
  ];
  const tradesKeys = [
    'trade_count',
    'total_trades',
    'dailyTrades',
    'daily_trades',
    'intradayTrades',
    'intraday_trades',
    'tradeCount',
    'trades',
    'orderCount',
    'orders',
    'daily_order_count'
  ];
  const commissionKeys = [
    'commission_total',
    'total_commission',
    'total_commissions',
    'commissions_total',
    'commission',
    'commissions',
    'total_fees',
    'fees_total',
    'total_fee',
    'fees'
  ];

  const dailySummary = isDailyPerformance?.summary as
    | Record<string, number | string | null | undefined>
    | undefined;

  let dailyPnl = isDailyPerformance ? pickNumericValue(dailySummary, pnlKeys) : null;
  let dailyCommission = isDailyPerformance ? pickNumericValue(dailySummary, commissionKeys) : null;

  let dailyTrades = isDailyPerformance ? pickNumericValue(dailySummary, tradesKeys) : null;

  if (dailyTrades === null && typeof isDailyPerformance?.totalOrders === 'number') {
    dailyTrades = isDailyPerformance.totalOrders;
  }

  if (dailyPnl === null && metricsSnapshot) {
    dailyPnl = pickNumericValue(metricsSnapshot.metrics, pnlKeys);
  }

  if (dailyTrades === null && metricsSnapshot) {
    dailyTrades = pickNumericValue(metricsSnapshot.metrics, tradesKeys);
  }

  if (dailyCommission === null && metricsSnapshot) {
    dailyCommission = pickNumericValue(metricsSnapshot.metrics, commissionKeys);
  }

  return {
    dailyPnl,
    dailyTrades: dailyTrades !== null ? Math.round(dailyTrades) : null,
    dailyCommission
  };
};

export const formatDailyPnl = (value: number | null): string => {
  if (value === null) {
    return '—';
  }
  const formatter = new Intl.NumberFormat('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
  return formatter.format(value);
};

export const formatDailyTrades = (value: number | null): string => {
  if (value === null) {
    return '—';
  }
  return value.toString();
};

export const formatDailyCommission = (value: number | null): string => {
  if (value === null) {
    return '—';
  }
  const formatter = new Intl.NumberFormat('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
  return formatter.format(value);
};
