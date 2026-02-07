import { DashboardData } from './types';

export const dashboardMockData: DashboardData = {
  account: {
    accountId: 'SIM-ACCOUNT',
    currency: 'USD',
    balance: 1250000,
    equity: 1284500,
    available: 840000,
    marginUsed: 411500,
    pnlRealized: 172300,
    pnlUnrealized: 112200,
    pnlRealizedToday: 16500,
    marginRatio: 0.32,
    updatedAt: '2024-04-29T09:30:00Z'
  },
  accountWarning: null,
  positions: [
    {
      id: 'pos-1',
      symbol: 'AAPL',
      direction: 'long',
      quantity: 500,
      avgPrice: 172.35,
      markPrice: 175.4,
      pnl: 1525
    },
    {
      id: 'pos-2',
      symbol: 'TSLA',
      direction: 'short',
      quantity: 200,
      avgPrice: 198.12,
      markPrice: 192.4,
      pnl: 1144
    },
    {
      id: 'pos-3',
      symbol: 'ESM4',
      direction: 'long',
      quantity: 3,
      avgPrice: 5168.5,
      markPrice: 5180.25,
      pnl: 1875
    }
  ],
  orders: [
    {
      id: 'ord-10234',
      symbol: 'AAPL',
      side: 'buy',
      type: 'limit',
      quantity: 200,
      filled: 100,
      price: 174.2,
      status: 'working',
      source: '策略: TrendAlpha',
      updatedAt: '2024-04-29T09:25:00Z'
    },
    {
      id: 'ord-10212',
      symbol: 'TSLA',
      side: 'sell',
      type: 'market',
      quantity: 50,
      filled: 50,
      status: 'filled',
      source: '手动下单',
      updatedAt: '2024-04-29T09:18:00Z'
    },
    {
      id: 'ord-10198',
      symbol: 'ESM4',
      side: 'buy',
      type: 'stop',
      quantity: 1,
      filled: 0,
      price: 5195.0,
      status: 'pending',
      source: '策略: MeanRevert',
      updatedAt: '2024-04-29T09:10:00Z'
    }
  ],
  riskRules: [
    {
      id: 'rule-1',
      dbId: null,
      symbol: 'AAPL',
      type: 'trailing',
      enabled: true,
      stopLossOffset: -7.2,
      takeProfitOffset: 8.5,
      trailingDistance: 2.1,
      trailingPercent: 0.015,
      positionLimit: { maxNet: 600, maxLong: 600 },
      lossLimit: { maxUnrealized: 2500, maxUnrealizedPct: 0.02 },
      notes: '日内趋势策略跟踪止损',
      metrics: {
        events: 4,
        lastEventAt: '2024-04-29T08:45:00Z',
        levels: { warning: 3, critical: 1 },
        actions: { reduce_position: 2, block_order: 1 },
        metrics: { unrealized_pnl: -420 }
      }
    },
    {
      id: 'rule-2',
      dbId: null,
      symbol: 'TSLA',
      type: 'fixed',
      enabled: false,
      stopLossOffset: -12,
      takeProfitOffset: 15,
      positionLimit: { maxNet: 400 },
      lossLimit: { maxUnrealized: 3000 },
      notes: '夜盘区间策略固定止损',
      metrics: {
        events: 2,
        lastEventAt: '2024-04-29T08:20:00Z',
        levels: { info: 2 },
        actions: { alert_only: 2 },
        metrics: { max_drawdown: -0.012 }
      }
    }
  ],
  strategies: [
    {
      id: 'str-1',
      name: 'TrendAlpha',
      symbol: 'AAPL',
      status: 'running',
      mode: 'live',
      returnRate: 0.124,
      lastSignal: 'BUY @ 174.20'
    },
    {
      id: 'str-2',
      name: 'MeanRevert',
      symbol: 'ESM4',
      status: 'running',
      mode: 'paper',
      returnRate: 0.058,
      lastSignal: 'SELL @ 5188.00'
    },
    {
      id: 'str-3',
      name: 'OvernightGamma',
      symbol: 'TSLA',
      status: 'stopped',
      mode: 'live',
      returnRate: -0.012,
      lastSignal: 'STOPPED @ 2024-04-28'
    }
  ],
  notifications: [
    {
      id: 'ntf-1',
      severity: 'warning',
      title: '风险告警',
      message: 'TSLA 空头头寸接近风险上限，建议减仓。',
      timestamp: '2024-04-29T09:27:10Z'
    },
    {
      id: 'ntf-2',
      severity: 'info',
      title: '系统通知',
      message: '策略 TrendAlpha 已完成最新参数回传。',
      timestamp: '2024-04-29T08:58:44Z'
    },
    {
      id: 'ntf-3',
      severity: 'error',
      title: '服务异常',
      message: '日志服务出现短暂断开，已自动重连。',
      timestamp: '2024-04-29T08:40:01Z'
    }
  ],
  depth: {
    bids: [
      { price: 175.3, size: 1200 },
      { price: 175.25, size: 980 },
      { price: 175.2, size: 860 }
    ],
    asks: [
      { price: 175.4, size: 1100 },
      { price: 175.45, size: 950 },
      { price: 175.5, size: 890 }
    ],
    midPrice: 175.35,
    spread: 0.1,
    symbol: 'AAPL',
    updatedAt: '2024-04-29T09:30:00Z'
  },
  symbols: [
    { symbol: 'AAPL', description: 'Apple Inc.', exchange: 'NASDAQ', tickSize: 0.01 },
    { symbol: 'TSLA', description: 'Tesla Inc.', exchange: 'NASDAQ', tickSize: 0.01 },
    { symbol: 'ESM4', description: 'E-mini S&P 500 Jun 2024', exchange: 'CME', tickSize: 0.25 }
  ],
  selectedSymbol: 'AAPL',
  timeframes: [
    { value: '1m', label: '1m' },
    { value: '5m', label: '5m' },
    { value: '15m', label: '15m' },
    { value: '1h', label: '1h' }
  ],
  selectedTimeframe: '5m',
  marketKline: {
    symbol: 'AAPL',
    timeframe: '5m',
    intervalSeconds: 300,
    durationSeconds: 24 * 60 * 60,
    end: '2024-04-29T09:25:00Z',
    bars: [
      { timestamp: '2024-04-29T08:30:00Z', open: 174.92, high: 175.4, low: 174.8, close: 175.15, volume: 128340 },
      { timestamp: '2024-04-29T08:35:00Z', open: 175.15, high: 175.5, low: 175.02, close: 175.34, volume: 142180 },
      { timestamp: '2024-04-29T08:40:00Z', open: 175.34, high: 175.62, low: 175.12, close: 175.48, volume: 118920 },
      { timestamp: '2024-04-29T08:45:00Z', open: 175.48, high: 175.78, low: 175.32, close: 175.65, volume: 102340 },
      { timestamp: '2024-04-29T08:50:00Z', open: 175.65, high: 175.82, low: 175.44, close: 175.7, volume: 98760 },
      { timestamp: '2024-04-29T08:55:00Z', open: 175.7, high: 175.9, low: 175.42, close: 175.62, volume: 113420 },
      { timestamp: '2024-04-29T09:00:00Z', open: 175.62, high: 175.86, low: 175.35, close: 175.58, volume: 125780 },
      { timestamp: '2024-04-29T09:05:00Z', open: 175.58, high: 175.72, low: 175.28, close: 175.42, volume: 119870 },
      { timestamp: '2024-04-29T09:10:00Z', open: 175.42, high: 175.55, low: 175.12, close: 175.18, volume: 121560 },
      { timestamp: '2024-04-29T09:15:00Z', open: 175.18, high: 175.44, low: 175.02, close: 175.32, volume: 111240 },
      { timestamp: '2024-04-29T09:20:00Z', open: 175.32, high: 175.52, low: 175.1, close: 175.4, volume: 105330 },
      { timestamp: '2024-04-29T09:25:00Z', open: 175.4, high: 175.6, low: 175.22, close: 175.4, volume: 98210 }
    ]
  },
  marketAvailability: {
    symbol: 'AAPL',
    timeframe: '5m',
    fileCount: 12,
    totalSize: 2359296,
    start: '2024-04-01T00:00:00Z',
    end: '2024-04-29T09:25:00Z',
    refreshedAt: '2024-04-29T09:30:00Z'
  },
  marketTicker: {
    symbol: 'AAPL',
    bid: 175.35,
    ask: 175.45,
    last: 175.4,
    lastSize: 320,
    close: 173.8,
    midPrice: 175.4,
    spread: 0.1,
    change: 1.6,
    changePercent: 0.92,
    updatedAt: '2024-04-29T09:29:50Z'
  }
};
