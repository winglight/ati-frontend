import type { RiskRuleMetrics } from '@features/risk/types';

export interface AccountSummary {
  accountId: string;
  currency?: string | null;
  balance: number;
  equity: number;
  available: number;
  marginUsed: number;
  pnlRealized: number;
  pnlUnrealized: number;
  pnlRealizedToday?: number | null;
  marginRatio: number;
  updatedAt: string;
}

export interface AccountAnalyticsPoint {
  date: string;
  equity: number;
  pnl: number;
}

export type AccountAnalyticsRange = '1m' | '3m' | '1y';

export type AccountAnalyticsSeriesMap = Partial<Record<AccountAnalyticsRange, AccountAnalyticsPoint[]>>;

export interface PositionItem {
  id: string;
  symbol: string;
  direction: 'long' | 'short';
  quantity: number;
  avgPrice: number;
  markPrice: number | null;
  pnl: number;
  multiplier?: number;
}

export interface WatchlistItem {
  id: string;
  groupId: string;
  symbol: string;
  sortOrder: number;
}

export interface WatchlistGroup {
  id: string;
  name: string;
  groupType: 'manual' | 'screener';
  strategyId: string | null;
  sortOrder: number;
  items: WatchlistItem[];
}

export interface OrderItem {
  id: string;
  ibOrderId?: string | null;
  clientOrderId?: string | null;
  symbol: string;
  side: 'buy' | 'sell';
  type: 'limit' | 'market' | 'stop';
  quantity: number;
  filled: number;
  remaining?: number;
  price?: number;
  limitPrice?: number | null;
  stopPrice?: number | null;
  fillPrice?: number | null;
  status: 'working' | 'filled' | 'cancelled' | 'rejected' | 'pending' | 'inactive';
  source: string;
  updatedAt: string;
  createdAt?: string | null;
  executedAt?: string | null;
  account?: string | null;
  exchange?: string | null;
  secType?: string | null;
  commission?: number | null;
  pnl?: number | null;
  realizedPnl?: number | null;
  unrealizedPnl?: number | null;
  rejectionReason?: string | null;
  strategy?: string | null;
  strategyName?: string | null;
  parentOrderId?: string | null;
  ruleId?: string | null;
  notes?: string | null;
  orderSource?: string | null;
  raw?: Record<string, unknown>;
  rawStatus?: string | null;
}

export interface RiskRuleAtrConfig {
  lookback?: number | null;
  barMinutes?: number | null;
  streamInterval?: number | null;
  updateThrottle?: number | null;
  multiplierSl?: number | null;
  multiplierTp?: number | null;
  deltaThreshold?: number | null;
}

export interface RiskRuleItem {
  id: string;
  dbId: number | null;
  symbol: string | null;
  type: 'fixed' | 'trailing' | 'atr_trailing';
  enabled: boolean;
  stopLossPrice?: number | null;
  takeProfitPrice?: number | null;
  stopLossOffset?: number | null;
  takeProfitOffset?: number | null;
  trailingDistance?: number | null;
  trailingPercent?: number | null;
  atrMultiplier?: number | null;
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
  metrics?: RiskRuleMetrics | null;
  atrConfig?: RiskRuleAtrConfig | null;
}

export type StrategyStatus = 'running' | 'stopped' | 'error' | 'starting';

export type StrategyFallbackMode = 'websocket' | 'http-polling';

export interface StrategyScheduleWindow {
  start: string;
  end: string;
}

export interface StrategyScheduleConfig {
  skipWeekends: boolean;
  windows: StrategyScheduleWindow[];
  timezone?: string | null;
  timezoneNotice?: string | null;
}

export type ScreenerScheduleMode = 'manual' | 'hourly' | 'daily' | 'weekly' | 'monthly';

export interface ScreenerProfileConfig {
  instrument?: string | null;
  location_code?: string | null;
  scan_code?: string | null;
  number_of_rows?: number | null;
  [key: string]: unknown;
}

export interface ScreenerScheduleConfig {
  mode?: ScreenerScheduleMode | null;
  time?: string | null;
  minute?: number | null;
  weekday?: string | null;
  day?: number | null;
  timezone?: string | null;
  skip_weekends?: boolean | null;
  windows?: StrategyScheduleWindow[] | null;
  [key: string]: unknown;
}

export interface StrategyParameterOption {
  value: string | number | boolean;
  label: string;
}

export interface StrategyParameterConfig {
  name: string;
  label?: string | null;
  type?: string | null;
  value: unknown;
  defaultValue?: unknown;
  description?: string | null;
  options?: StrategyParameterOption[] | null;
  min?: number | null;
  max?: number | null;
  step?: number | null;
}

export interface StrategyTemplateItem {
  id: string;
  name: string;
  description?: string | null;
  parameters?: StrategyParameterConfig[] | null;
}

export interface StrategyFileItem {
  path: string;
  name: string;
  module: string;
  metadata?: StrategyFileMetadata | null;
}

export interface StrategyFileMetadata {
  className?: string | null;
  qualifiedName?: string | null;
  baseClass?: string | null;
  baseClassPath?: string | null;
  strategyType?: string | null;
  strategyName?: string | null;
  filePath?: string | null;
  description?: string | null;
  parameters?: StrategyParameterConfig[] | null;
  schedule?: {
    skipWeekends?: boolean | null;
    windows?: StrategyScheduleWindow[] | null;
  } | null;
  summaryPoints?: string[] | null;
}

export interface StrategyMetricsSnapshot {
  metrics: Record<string, number | string>;
  updatedAt?: string | null;
  period?: string | null;
  lastUpdatedAt?: string | null;
}

export interface StrategyOrderItem {
  id: string;
  timestamp: string;
  side: string;
  quantity: number;
  price: number;
  pnl?: number | null;
  symbol?: string | null;
  filledQuantity?: number | null;
  averagePrice?: number | null;
  executedAt?: string | null;
  status?: string | null;
  realizedPnl?: number | null;
  commission?: number | null;
  orderSource?: string | null;
  notes?: string | null;
  metadata?: Record<string, unknown> | null;
}

export type StrategyPerformanceSection =
  | 'summary'
  | 'orders'
  | 'charts'
  | 'calendar'
  | 'realtime';

export interface StrategyPerformanceSnapshot {
  summary?: Record<string, number | string | null>;
  orders?: StrategyOrderItem[];
  totalOrders?: number;
  page?: number;
  pageSize?: number;
  hasNext?: boolean;
  realtime?: Record<string, number | string | null> | null;
  updatedAt?: string | null;
  period: string;
  charts?: StrategyPerformanceCharts | null;
  calendar?: StrategyPnLCalendar | null;
  marketTimezone?: string | null;
}

export interface StrategyPerformancePoint {
  timestamp: string;
  value: number;
}

export interface StrategyDistributionPoint {
  bucket: string;
  value: number;
}

export interface TradeMarker {
  id?: string;
  timestamp: string | number;
  side: 'buy' | 'sell';
  price?: number | null;
}

export interface StrategyPerformanceCharts {
  cumulativePnl: StrategyPerformancePoint[];
  drawdown: StrategyPerformancePoint[];
  distribution: StrategyDistributionPoint[];
  winLoss: StrategyDistributionPoint[];
}

export interface StrategyPnLCalendarDay {
  date: string;
  pnl: number;
}

export interface StrategyPnLCalendarMonth {
  month: string;
  days: StrategyPnLCalendarDay[];
}

export interface StrategyPnLCalendar {
  months: StrategyPnLCalendarMonth[];
  start?: string | null;
  end?: string | null;
}

export interface StrategyCandlePoint {
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface StrategyCandleSignal {
  timestamp: string;
  side: string;
  price: number;
  pnl?: number | null;
}

export interface StrategyCandlesSnapshot {
  symbol?: string | null;
  interval: string;
  intervalSeconds?: number | null;
  durationSeconds?: number | null;
  refreshedAt?: string | null;
  candles: StrategyCandlePoint[];
  signals: StrategyCandleSignal[];
}

export interface StrategyItem {
  id: string;
  name: string;
  symbol: string;
  status: StrategyStatus;
  mode: 'live' | 'paper' | 'backtest';
  returnRate: number;
  lastSignal?: string | null;
  description?: string | null;
  templateId?: string | null;
  schedule?: StrategyScheduleConfig | null;
  parameters?: StrategyParameterConfig[] | null;
  metricsSnapshot?: StrategyMetricsSnapshot | null;
  performanceSnapshot?: StrategyPerformanceSnapshot | null;
  lastUpdatedAt?: string | null;
  enabled?: boolean;
  active?: boolean;
  tags?: string[] | null;
  dataSource?: string | null;
  filePath?: string | null;
  strategyOrigin?: string | null;
  isKlineStrategy?: boolean;
  triggerCount?: number | null;
  lastTriggeredAt?: string | null;
  exit_config?: Array<Record<string, unknown>> | null;
  screenerProfile?: ScreenerProfileConfig | null;
  screenerSchedule?: ScreenerScheduleConfig | null;
}

export interface StrategyRuntimeLogEntry {
  id: string;
  level?: string | null;
  tone?: string | null;
  timestamp?: string | null;
  message?: string | null;
  details?: unknown;
}

export interface StrategyRuntimeDataPush {
  symbol?: string | null;
  subscription?: string | null;
  last_data_timestamp?: string | null;
  status_reason?: string | null;
  status_cause?: string | null;
  status_cause_code?: string | null;
  is_receiving_data?: boolean | null;
  data_label?: string | null;
  data_label_display?: string | null;
  [key: string]: unknown;
}

export interface StrategyRuntimeStopLevels {
  stop_loss_enabled?: boolean | null;
  stop_loss_price?: number | null;
  take_profit_enabled?: boolean | null;
  take_profit_price?: number | null;
  [key: string]: unknown;
}

export interface StrategyRuntimeSummary {
  is_receiving_data?: boolean | null;
  awaiting_data?: boolean | null;
  runtime_seconds?: number | null;
  processed_count?: number | null;
  threshold_hits?: number | null;
  buy_signals?: number | null;
  sell_signals?: number | null;
  data_label?: string | null;
  data_label_display?: string | null;
  [key: string]: unknown;
}

export interface StrategyRuntimeSnapshotData {
  summary: StrategyRuntimeSummary;
  refreshedAt?: string | null;
  data_push?: StrategyRuntimeDataPush | null;
  stop_levels?: StrategyRuntimeStopLevels | null;
  logs?: StrategyRuntimeLogEntry[] | null;
  [key: string]: unknown;
}

export interface StrategyRunnerStatus {
  ready: boolean;
  reason?: string | null;
}

export interface StrategyRuntimeDetail {
  strategyId: string;
  status: { active: boolean; enabled: boolean };
  snapshot: StrategyRuntimeSnapshotData;
  runnerStatus?: StrategyRunnerStatus | null;
  triggerCount?: number | null;
  lastTriggeredAt?: string | null;
}

export interface StrategyDetailSummary {
  id: string;
  name: string;
  description?: string | null;
  strategyType?: string | null;
  primarySymbol?: string | null;
  secondarySymbol?: string | null;
  dataSource?: string | null;
  strategyOrigin?: string | null;
  filePath?: string | null;
  childStrategyType?: string | null;
  childParameters?: Record<string, unknown> | null;
  maxChildren?: number | null;
  selectionLimit?: number | null;
  triggerCount?: number | null;
  lastTriggeredAt?: string | null;
  schedule?: StrategyScheduleConfig | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  parameters?: Record<string, unknown> | null;
  parameterDefinitions?: StrategyParameterConfig[] | null;
  isKlineStrategy?: boolean;
  exit_config?: Array<Record<string, unknown>> | null;
  screenerProfile?: ScreenerProfileConfig | null;
  screenerSchedule?: ScreenerScheduleConfig | null;
}

export interface StrategyRiskSettings {
  id?: number | null;
  strategyRecordId?: string | null;
  strategyId: string;
  maxPosition?: number | null;
  forbidPyramiding: boolean;
  lossThreshold?: number | null;
  lossDurationMinutes?: number | null;
  notifyOnBreach: boolean;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export type StrategyRiskLogCheckStatus = 'pass' | 'fail' | 'warning' | 'info' | 'unknown';

export interface StrategyRiskLogCheck {
  id: string;
  label: string;
  status: StrategyRiskLogCheckStatus;
  reason?: string | null;
  currentValue?: string | null;
  threshold?: string | null;
}

export interface StrategyRiskLogEntry {
  timestamp: string;
  level: string;
  action: string;
  status?: string | null;
  message?: string | null;
  summary?: string | null;
  checks?: StrategyRiskLogCheck[] | null;
  context?: Record<string, unknown> | null;
}

export interface NotificationItem {
  id: string;
  severity: 'info' | 'warning' | 'error';
  title: string;
  message: string;
  timestamp: string;
  read?: boolean;
  acknowledgedAt?: string | null;
  channel?: string | null;
  status?: string | null;
  event?: string | null;
  errorDetail?: string | null;
}

export interface DepthEntry {
  price: number;
  size: number;
}

export interface DepthSnapshot {
  bids: DepthEntry[];
  asks: DepthEntry[];
  midPrice?: number | null;
  spread?: number | null;
  symbol?: string;
  updatedAt?: string;
  totalBidSize?: number | null;
  totalAskSize?: number | null;
}

export interface DomTrendPoint {
  timestamp: number;
  imbalanceRatio: number;
  momentum: number;
}

export interface DomSignal {
  id: string;
  timestamp: number;
  type: 'buy' | 'sell';
  strength: number;
  momentum: number;
  text: string;
}

export interface SymbolInfo {
  symbol: string;
  description: string;
  exchange: string;
  tickSize?: number | null;
  secType?: string | null;
  domCapable?: boolean | null;
}

export interface TimeframeOption {
  value: string;
  label: string;
}

export interface MarketBar {
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number | null;
}

export interface MarketKlineSnapshot {
  symbol: string;
  timeframe: string;
  intervalSeconds: number;
  durationSeconds: number;
  bars: MarketBar[];
  end?: string | null;
}

export interface MarketAvailability {
  symbol: string;
  timeframe: string;
  fileCount: number;
  totalSize: number;
  start?: string | null;
  end?: string | null;
  refreshedAt?: string;
  status?: 'ready' | 'missing' | 'unknown';
  suggestedStart?: string | null;
  suggestedEnd?: string | null;
  pendingBackfill?: boolean;
  backfillJobId?: string | null;
}

export interface MarketTickerSnapshot {
  symbol: string;
  bid?: number | null;
  ask?: number | null;
  last?: number | null;
  lastSize?: number | null;
  close?: number | null;
  midPrice?: number | null;
  spread?: number | null;
  change?: number | null;
  changePercent?: number | null;
  updatedAt?: string;
}

export type MarketConnectionStatus =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'failed';

export type MarketSubscriptionStatus = 'idle' | 'pending' | 'ready' | 'failed';

export interface MarketSubscriptionMetadata {
  id: string | null;
  symbol: string | null;
  timeframe: string | null;
  topics: string[];
  capabilities?: Record<string, unknown> | null;
  secType?: string | null;
  exchange?: string | null;
  currency?: string | null;
  primaryExchange?: string | null;
  localSymbol?: string | null;
  tradingClass?: string | null;
  lastTradeDateOrContractMonth?: string | null;
  contractMonth?: string | null;
  multiplier?: number | string | null;
}

export interface MarketSubscriptionState {
  status: MarketSubscriptionStatus;
  metadata: MarketSubscriptionMetadata | null;
  error: string | null;
  connectionStatus: MarketConnectionStatus;
}

export interface DashboardData {
  account: AccountSummary | null;
  accountWarning?: string | null;
  positions: PositionItem[];
  orders: OrderItem[];
  riskRules: RiskRuleItem[];
  strategies: StrategyItem[];
  notifications: NotificationItem[];
  depth: DepthSnapshot;
  symbols: SymbolInfo[];
  selectedSymbol: string;
  timeframes: TimeframeOption[];
  selectedTimeframe: string;
  marketKline: MarketKlineSnapshot | null;
  marketAvailability: MarketAvailability | null;
  marketTicker: MarketTickerSnapshot | null;
}
