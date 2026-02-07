import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type {
  MarketAvailability,
  MarketBar,
  MarketConnectionStatus,
  MarketSubscriptionState,
  MarketTickerSnapshot,
  PositionItem,
  RiskRuleItem,
  SymbolInfo,
  TimeframeOption
} from '../types';
import type { SaveRiskRuleArgs } from '@store/thunks/riskRules';
import CandlestickChart, { PriceOverlay } from './CandlestickChart';
// 已移除 DOM 趋势图组件引用
import SymbolCombobox from './SymbolCombobox';
import styles from './MarketMonitorPanel.module.css';
import { formatPriceWithTick } from '../utils/priceFormatting';
import {
  directionalOffsetFromPrice,
  priceFromDirectionalOffset
} from '../../../utils/riskDefaults';


interface MarketMonitorPanelProps {
  symbols: SymbolInfo[];
  selectedSymbol: string;
  timeframes: TimeframeOption[];
  selectedTimeframe: string;
  bars: MarketBar[];
  ticker: MarketTickerSnapshot | null;
  availability: MarketAvailability | null;
  subscription: MarketSubscriptionState;
  connectionStatus: MarketConnectionStatus;
  subscriptionNotice?: string | null;
  monitorActive: boolean;
  selectedDuration: string;
  position: PositionItem | null;
  riskRule: RiskRuleItem | null;
  riskRuleSaving: boolean;
  lastSavedRuleId?: string;
  onSymbolChange: (symbol: string) => void;
  onTimeframeChange: (timeframe: string) => void;
  onToggleMonitor: () => void;
  onRefresh: () => void;
  onDurationChange: (duration: string) => void;
  onSaveRiskRule: (input: SaveRiskRuleArgs) => void;
  onToggleRiskRule: (rule: RiskRuleItem, enabled: boolean) => void;
  onRetryConnection: () => void;
}

type DurationKey = '1H' | '3H' | '1D' | '1W' | '1M';

const DURATION_OPTIONS: Array<{ value: DurationKey; label: string }> = [
  { value: '1H', label: '1H' },
  { value: '3H', label: '3H' },
  { value: '1D', label: '1D' },
  { value: '1W', label: '1W' },
  { value: '1M', label: '1M' }
];

const DEBUG_MARKET_MONITOR = import.meta.env?.VITE_DEBUG_MARKET_MONITOR === 'true';

const numberFormatter = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});

const formatNumber = (value: number | null | undefined, fractionDigits = 2): string => {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return '—';
  }
  if (fractionDigits !== 2) {
    return value.toFixed(fractionDigits);
  }
  return numberFormatter.format(value);
};

const formatPercent = (value: number | null | undefined): string => {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return '—';
  }
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}%`;
};

const formatSignedNumber = (value: number | null | undefined, fractionDigits = 2): string => {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return '—';
  }
  const absValue = Math.abs(value);
  const formatted =
    fractionDigits === 2 ? numberFormatter.format(absValue) : absValue.toFixed(fractionDigits);
  if (value > 0) {
    return `+${formatted}`;
  }
  if (value < 0) {
    return `-${formatted}`;
  }
  return formatted;
};

const formatCurrency = (value: number | null | undefined): string => {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return '—';
  }
  return currencyFormatter.format(value);
};

export const selectBestTickerPrice = (
  snapshot: MarketTickerSnapshot | null | undefined
): number | null => {
  if (!snapshot) {
    return null;
  }
  const { midPrice, last, bid, ask, close } = snapshot;
  for (const candidate of [midPrice, last, bid, ask, close]) {
    if (candidate != null && Number.isFinite(candidate)) {
      return candidate;
    }
  }
  return null;
};

const formatVolume = (value: number | null | undefined): string => {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return '—';
  }
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(2)}M`;
  }
  if (value >= 1_000) {
    return `${(value / 1_000).toFixed(2)}K`;
  }
  return value.toLocaleString();
};

const formatTimeRange = (value: MarketAvailability | null): string => {
  if (!value) {
    return 'NaN';
  }
  if (value.status === 'missing') {
    if (value.pendingBackfill) {
      const jobHint = value.backfillJobId ? `（任务 ${value.backfillJobId.slice(0, 8)}）` : '';
      return `本地暂无 ${value.symbol} ${value.timeframe} 数据，已自动提交回补${jobHint}`;
    }
    const start = value.suggestedStart ? new Date(value.suggestedStart).toLocaleString() : '—';
    const end = value.suggestedEnd ? new Date(value.suggestedEnd).toLocaleString() : '—';
    return `本地暂无 ${value.symbol} ${value.timeframe} 数据，建议回补 ${start} ~ ${end}`;
  }
  const start = value.start ? new Date(value.start).toLocaleString() : '—';
  const end = value.end ? new Date(value.end).toLocaleString() : '—';
  return `覆盖区间：${start} ~ ${end} · 文件 ${value.fileCount ?? 0} 个`;
};

// 已移除 DOM 信号时间格式化，避免保留无用函数

const parsePrice = (value: string): number | null => {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) {
    return null;
  }
  return parsed;
};

const pickMetricValue = (rule: RiskRuleItem | null, keys: string[]): number | null => {
  if (!rule?.metrics?.metrics) {
    return null;
  }
  for (const key of keys) {
    const candidate = rule.metrics.metrics[key];
    if (typeof candidate === 'number' && Number.isFinite(candidate)) {
      return candidate;
    }
  }
  return null;
};

export interface TrailingSnapshot {
  peak: number | null;
  trough: number | null;
}

const MIN_TAKE_PROFIT_GAP = 1e-6;

export const advanceTrailingSnapshot = (
  previous: TrailingSnapshot | null,
  position: PositionItem,
  price: number | null
): TrailingSnapshot => {
  const baseline = Number.isFinite(position.avgPrice) ? position.avgPrice : price;
  if (position.direction === 'long') {
    const peakBaseline = previous?.peak ?? baseline ?? null;
    const troughBaseline = previous?.trough ?? baseline ?? null;
    const peak =
      price != null && Number.isFinite(price)
        ? Math.max(peakBaseline ?? price, price)
        : peakBaseline;
    return {
      peak: peak ?? null,
      trough: troughBaseline ?? null
    };
  }
  const peakBaseline = previous?.peak ?? baseline ?? null;
  const troughBaseline = previous?.trough ?? baseline ?? null;
  const trough =
    price != null && Number.isFinite(price)
      ? Math.min(troughBaseline ?? price, price)
      : troughBaseline;
  return {
    peak: peakBaseline ?? null,
    trough: trough ?? null
  };
};

export const resolveRiskPrice = (
  rule: RiskRuleItem | null,
  type: 'stopLoss' | 'takeProfit',
  position: PositionItem | null,
  currentPrice: number | null,
  trailingSnapshot: TrailingSnapshot | null
): number | null => {
  if (!rule) {
    return null;
  }
  const metric = pickMetricValue(rule, type === 'stopLoss'
    ? ['stop_loss_price', 'sl_price', 'stop_loss']
    : ['take_profit_price', 'tp_price', 'take_profit']);
  if (metric != null) {
    return metric;
  }
  if (rule.type === 'trailing' || rule.type === 'atr_trailing') {
    if (rule.type === 'trailing' && type === 'takeProfit') {
      return null;
    }
    if (!position) {
      return null;
    }
    const avgPrice = position.avgPrice;
    if (avgPrice == null || Number.isNaN(avgPrice)) {
      return null;
    }
    const price = currentPrice != null && Number.isFinite(currentPrice) ? currentPrice : null;
    const distance =
      rule.trailingDistance != null && Number.isFinite(rule.trailingDistance)
        ? Math.abs(rule.trailingDistance)
        : null;
    const percent =
      rule.trailingPercent != null && Number.isFinite(rule.trailingPercent)
        ? Math.abs(rule.trailingPercent)
        : null;
    if (position.direction === 'long') {
      const peak = trailingSnapshot?.peak ?? (price ?? avgPrice);
      if (peak == null || Number.isNaN(peak)) {
        return null;
      }
      let threshold = 0;
      if (distance != null) {
        threshold = Math.max(threshold, distance);
      }
      if (percent != null && peak > avgPrice) {
        threshold = Math.max(threshold, (peak - avgPrice) * percent);
      }
      const stop = peak - threshold;
      if (type === 'stopLoss') {
        return stop;
      }
      const desired = price ?? peak;
      return Math.max(desired, stop + Math.max(MIN_TAKE_PROFIT_GAP, 0));
    }
    const trough = trailingSnapshot?.trough ?? (price ?? avgPrice);
    if (trough == null || Number.isNaN(trough)) {
      return null;
    }
    let threshold = 0;
    if (distance != null) {
      threshold = Math.max(threshold, distance);
    }
    if (percent != null && avgPrice > trough) {
      threshold = Math.max(threshold, (avgPrice - trough) * percent);
    }
    const stop = trough + threshold;
    if (type === 'stopLoss') {
      return stop;
    }
    const desired = price ?? trough;
    return Math.min(desired, stop - Math.max(MIN_TAKE_PROFIT_GAP, 0));
  }
  const explicit =
    type === 'stopLoss' ? rule.stopLossPrice : rule.takeProfitPrice;
  if (explicit != null && Number.isFinite(explicit)) {
    return explicit;
  }
  const base = position?.avgPrice;
  if (base == null || Number.isNaN(base)) {
    return null;
  }
  const offset = type === 'stopLoss' ? rule.stopLossOffset : rule.takeProfitOffset;
  if (offset == null || Number.isNaN(offset)) {
    return null;
  }
  const direction = position?.direction;
  if (direction !== 'long' && direction !== 'short') {
    return null;
  }
  return priceFromDirectionalOffset(base, offset, direction);
};

interface DistributionMarker {
  key: 'low' | 'open' | 'close' | 'high';
  label: string;
  value: number | null;
  percent: number;
}

const DISTRIBUTION_LABEL_MAP: Record<DistributionMarker['key'], string> = {
  low: 'Low',
  open: 'Open',
  close: 'Close',
  high: 'High'
};

const DISTRIBUTION_SORT_WEIGHT: Record<DistributionMarker['key'], number> = {
  low: 0,
  close: 1,
  open: 2,
  high: 3
};

type MarkerAlignment = 'center' | 'left' | 'right' | 'farLeft' | 'farRight';

type EnrichedDistributionMarker = DistributionMarker & {
  displayValue: string;
  accessibleLabel: string;
  tooltip: string;
  alignment: MarkerAlignment;
};

const clampPercent = (value: number | null, fallback: number): number => {
  const boundedFallback = Math.max(0, Math.min(100, fallback));
  if (value == null || Number.isNaN(value)) {
    return boundedFallback;
  }
  return Math.max(0, Math.min(100, value));
};

const clampPercentWithPadding = (value: number, padding: number): number => {
  const effectivePadding = Math.max(0, Math.min(50, padding));
  const bounded = Math.max(0, Math.min(100, value));
  return Math.max(effectivePadding, Math.min(100 - effectivePadding, bounded));
};

const isFiniteNumber = (value: number | null | undefined): value is number =>
  value != null && Number.isFinite(value);

const computeDistribution = (
  bars: MarketBar[],
  markerValues: { open: number | null; close: number | null; fallbackOpen?: number | null; fallbackClose?: number | null }
) => {
  if (!bars.length) {
    return { low: null, high: null, markers: [] as DistributionMarker[] };
  }
  const lows = bars
    .map((bar) => bar.low)
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  const highs = bars
    .map((bar) => bar.high)
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  if (!lows.length || !highs.length) {
    return { low: null, high: null, markers: [] as DistributionMarker[] };
  }
  const low = Math.min(...lows);
  const high = Math.max(...highs);
  const range = high - low;
  const percentFor = (value: number | null): number | null => {
    if (!isFiniteNumber(value) || range <= 0) {
      return null;
    }
    const ratio = ((value - low) / range) * 100;
    if (!Number.isFinite(ratio)) {
      return null;
    }
    return Math.max(0, Math.min(100, ratio));
  };
  const resolvedOpen = isFiniteNumber(markerValues.open)
    ? markerValues.open
    : isFiniteNumber(markerValues.fallbackOpen)
      ? markerValues.fallbackOpen
      : null;
  const resolvedClose = isFiniteNumber(markerValues.close)
    ? markerValues.close
    : isFiniteNumber(markerValues.fallbackClose)
      ? markerValues.fallbackClose
      : null;
  const markers: DistributionMarker[] = [
    { key: 'low', label: 'L', value: low, percent: 0 },
    {
      key: 'open',
      label: 'O',
      value: resolvedOpen,
      percent: clampPercent(percentFor(resolvedOpen), 0)
    },
    {
      key: 'close',
      label: 'C',
      value: resolvedClose,
      percent: clampPercent(percentFor(resolvedClose), 50)
    },
    { key: 'high', label: 'H', value: high, percent: 100 }
  ];
  return { low, high, markers };
};

  function MarketMonitorPanel({
  symbols,
  selectedSymbol,
  timeframes,
  selectedTimeframe,
  bars,
  ticker,
  availability,
  subscription,
  connectionStatus: realtimeConnectionStatus,
  subscriptionNotice = null,
  monitorActive,
  selectedDuration,
  position,
  riskRule,
  riskRuleSaving,
  lastSavedRuleId,
  onSymbolChange,
  onTimeframeChange,
    onToggleMonitor,
    onDurationChange,
    onSaveRiskRule,
    onToggleRiskRule,
    onRetryConnection
  }: MarketMonitorPanelProps) {
  const { t } = useTranslation();

  const durationLabelMap: Record<DurationKey, string> = useMemo(
    () => ({
      '1H': t('dashboard.kline.duration.1h'),
      '3H': t('dashboard.kline.duration.3h'),
      '1D': t('dashboard.kline.duration.1d'),
      '1W': t('dashboard.kline.duration.1w'),
      '1M': t('dashboard.kline.duration.1m')
    }),
    [t]
  );
  const timeframeLabelMap: Record<string, string> = useMemo(
    () => ({
      '1m': t('dashboard.kline.timeframe.1m'),
      '5m': t('dashboard.kline.timeframe.5m'),
      '15m': t('dashboard.kline.timeframe.15m'),
      '1h': t('dashboard.kline.timeframe.1h')
    }),
    [t]
  );
  const latestBar = bars.length > 0 ? bars[bars.length - 1] : undefined;
  const previousBar = bars.length > 1 ? bars[bars.length - 2] : undefined;
  const tickerBestPrice = selectBestTickerPrice(ticker);
  const referencePrice = ticker?.close ?? previousBar?.close ?? latestBar?.open ?? null;
  const fallbackPrice = position?.markPrice ?? null;
  const effectiveLastPrice = tickerBestPrice ?? fallbackPrice ?? latestBar?.close ?? null;
  const subscriptionMeta = subscription.metadata;
  const subscriptionStatus = subscription.status;
  const subscriptionError = subscription.error;
  const changeValue =
    ticker?.change ??
    (effectiveLastPrice !== null && referencePrice !== null ? effectiveLastPrice - referencePrice : null);
  const changePercent =
    ticker?.changePercent ?? (changeValue !== null && referencePrice ? (changeValue / referencePrice) * 100 : null);

  const effectiveClosePrice = tickerBestPrice ?? latestBar?.close ?? null;
  const distribution = useMemo(
    () =>
      computeDistribution(bars, {
        open: latestBar?.open ?? null,
        close: effectiveClosePrice,
        fallbackOpen: previousBar?.close ?? previousBar?.open ?? null,
        fallbackClose: previousBar?.close ?? previousBar?.open ?? null
      }),
    [
      bars,
      effectiveClosePrice,
      latestBar?.open,
      previousBar?.close,
      previousBar?.open
    ]
  );
  const trailingStateRef = useRef<TrailingSnapshot | null>(null);
  const trailingKeyRef = useRef<string | null>(null);
  const trailingSnapshot = useMemo(() => {
    if (!riskRule || riskRule.type !== 'trailing' || !position) {
      trailingStateRef.current = null;
      trailingKeyRef.current = null;
      return null;
    }
    const key = `${riskRule.id}:${position.id ?? position.symbol}:${position.direction}`;
    if (trailingKeyRef.current !== key) {
      trailingStateRef.current = null;
      trailingKeyRef.current = key;
    }
    const price = effectiveLastPrice != null && Number.isFinite(effectiveLastPrice) ? effectiveLastPrice : null;
    const snapshot = advanceTrailingSnapshot(trailingStateRef.current, position, price);
    trailingStateRef.current = snapshot;
    return snapshot;
  }, [effectiveLastPrice, position, riskRule]);

  const resolvedStopLoss = useMemo(
    () => resolveRiskPrice(riskRule, 'stopLoss', position, effectiveLastPrice ?? null, trailingSnapshot),
    [riskRule, position, effectiveLastPrice, trailingSnapshot]
  );
  const resolvedTakeProfit = useMemo(
    () =>
      resolveRiskPrice(riskRule, 'takeProfit', position, effectiveLastPrice ?? null, trailingSnapshot),
    [riskRule, position, effectiveLastPrice, trailingSnapshot]
  );

  const [stopLossInput, setStopLossInput] = useState('');
  const [takeProfitInput, setTakeProfitInput] = useState('');
  const [dirty, setDirty] = useState(false);
  const [riskDropdownOpen, setRiskDropdownOpen] = useState(false);

  const fixedRule = riskRule?.type === 'fixed';

  useEffect(() => {
    if (!fixedRule) {
      setStopLossInput('');
      setTakeProfitInput('');
      setDirty(false);
      return;
    }
    setStopLossInput(resolvedStopLoss != null ? resolvedStopLoss.toFixed(2) : '');
    setTakeProfitInput(resolvedTakeProfit != null ? resolvedTakeProfit.toFixed(2) : '');
    setDirty(false);
  }, [fixedRule, resolvedStopLoss, resolvedTakeProfit, riskRule?.id, selectedSymbol]);

  useEffect(() => {
    if (!lastSavedRuleId || !riskRule || lastSavedRuleId !== riskRule.id) {
      return;
    }
    if (!fixedRule) {
      return;
    }
    setDirty(false);
  }, [fixedRule, lastSavedRuleId, riskRule]);

  useEffect(() => {
    if (!DEBUG_MARKET_MONITOR) {
      return;
    }
    console.info('[MarketMonitorPanel] subscription state updated', subscription);
  }, [subscription]);

  useEffect(() => {
    if (!DEBUG_MARKET_MONITOR) {
      return;
    }
    console.info('[MarketMonitorPanel] ticker snapshot updated', ticker);
  }, [ticker]);

  useEffect(() => {
    if (!DEBUG_MARKET_MONITOR) {
      return;
    }
    const latestBar = bars.length > 0 ? bars[bars.length - 1] : null;
    console.info('[MarketMonitorPanel] bars updated', { count: bars.length, latestBar });
  }, [bars]);

  // Reference monitor-related props in debug mode to avoid unused warnings
  useEffect(() => {
    if (!DEBUG_MARKET_MONITOR) {
      return;
    }
    console.info('[MarketMonitorPanel] monitor state', {
      active: monitorActive,
      toggleFnPresent: typeof onToggleMonitor === 'function'
    });
  }, [monitorActive, onToggleMonitor]);

  const hasPosition = Boolean(position && Number.isFinite(position.quantity) && position.quantity !== 0);
  const riskRuleActive = Boolean(riskRule?.enabled);

  const stopLossPrice = fixedRule ? parsePrice(stopLossInput) : resolvedStopLoss;
  const takeProfitPrice = fixedRule ? parsePrice(takeProfitInput) : resolvedTakeProfit;

  const avgPrice = position?.avgPrice ?? null;
  const markPrice = position?.markPrice ?? effectiveLastPrice ?? null;
  const positionSymbol = position?.symbol ?? selectedSymbol;
  const symbolMetadata = useMemo(() => {
    const target = positionSymbol?.toUpperCase() ?? selectedSymbol?.toUpperCase();
    if (!target) {
      return null;
    }
    const direct = symbols.find((item) => item.symbol.toUpperCase() === target);
    if (direct) {
      return direct;
    }
    const root = target.replace(/\d+.*/, '');
    return symbols.find((item) => item.symbol.toUpperCase() === root) ?? null;
  }, [positionSymbol, selectedSymbol, symbols]);
  const priceTickSize = symbolMetadata?.tickSize ?? undefined;
  const stopLossPercent =
    avgPrice && stopLossPrice != null ? ((stopLossPrice - avgPrice) / avgPrice) * 100 : null;
  const takeProfitPercent =
    avgPrice && takeProfitPrice != null ? ((takeProfitPrice - avgPrice) / avgPrice) * 100 : null;
  const stopLossDelta =
    avgPrice != null && stopLossPrice != null ? stopLossPrice - avgPrice : null;
  const takeProfitDelta =
    avgPrice != null && takeProfitPrice != null ? takeProfitPrice - avgPrice : null;

  const positionQuantity = position ? Math.abs(position.quantity ?? 0) : null;
  const positionDirection = position?.direction === 'short' ? -1 : 1;
  const rawMultiplier = position?.multiplier ?? null;
  const positionMultiplier =
    rawMultiplier != null && Number.isFinite(rawMultiplier) && Math.abs(rawMultiplier) > 0
      ? Math.abs(rawMultiplier)
      : 1;

  const stopLossExpectation =
    stopLossPrice != null && markPrice != null && positionQuantity
      ? (stopLossPrice - markPrice) * positionQuantity * positionDirection * positionMultiplier
      : null;
  const takeProfitExpectation =
    takeProfitPrice != null && markPrice != null && positionQuantity
      ? (takeProfitPrice - markPrice) * positionQuantity * positionDirection * positionMultiplier
      : null;

  const riskRewardRatio =
    stopLossExpectation != null && takeProfitExpectation != null && stopLossExpectation !== 0
      ? Math.abs(takeProfitExpectation / stopLossExpectation)
      : null;
  const stopLossDeltaClass =
    stopLossDelta == null || Number.isNaN(stopLossDelta)
      ? ''
      : stopLossDelta > 0
        ? styles.riskPositive
        : stopLossDelta < 0
          ? styles.riskNegative
          : styles.riskNeutral;
  const takeProfitDeltaClass =
    takeProfitDelta == null || Number.isNaN(takeProfitDelta)
      ? ''
      : takeProfitDelta > 0
        ? styles.riskPositive
        : takeProfitDelta < 0
          ? styles.riskNegative
          : styles.riskNeutral;
  const stopLossPercentClass =
    stopLossPercent == null || Number.isNaN(stopLossPercent)
      ? ''
      : stopLossPercent > 0
        ? styles.riskPositive
        : stopLossPercent < 0
          ? styles.riskNegative
          : styles.riskNeutral;
  const takeProfitPercentClass =
    takeProfitPercent == null || Number.isNaN(takeProfitPercent)
      ? ''
      : takeProfitPercent > 0
        ? styles.riskPositive
        : takeProfitPercent < 0
          ? styles.riskNegative
          : styles.riskNeutral;
  const stopLossExpectationClass =
    stopLossExpectation == null || Number.isNaN(stopLossExpectation)
      ? styles.riskNeutralValue
      : stopLossExpectation < 0
        ? styles.riskLossValue
        : stopLossExpectation > 0
          ? styles.riskProfitValue
          : styles.riskNeutralValue;
  const takeProfitExpectationClass =
    takeProfitExpectation == null || Number.isNaN(takeProfitExpectation)
      ? styles.riskNeutralValue
      : takeProfitExpectation < 0
        ? styles.riskLossValue
        : takeProfitExpectation > 0
          ? styles.riskProfitValue
          : styles.riskNeutralValue;
  const riskRewardDisplay = riskRewardRatio != null ? `${riskRewardRatio.toFixed(2)}:1` : '—';

  const formattedLastPrice = formatPriceWithTick(effectiveClosePrice, positionSymbol, {
    tickSize: priceTickSize
  });
  const formattedLow = formatPriceWithTick(distribution.low, positionSymbol, {
    tickSize: priceTickSize
  });
  const formattedHigh = formatPriceWithTick(distribution.high, positionSymbol, {
    tickSize: priceTickSize
  });
  const changeValueClass =
    changeValue != null && !Number.isNaN(changeValue)
      ? changeValue >= 0
        ? styles.metricPositive
        : styles.metricNegative
      : '';
  const changePercentClass =
    changePercent != null && !Number.isNaN(changePercent)
      ? changePercent >= 0
        ? styles.metricPositive
        : styles.metricNegative
      : '';
  const changePercentDisplay = formatPercent(changePercent);
  const changePercentInline =
    changePercentDisplay === '—' ? changePercentDisplay : `(${changePercentDisplay})`;

  const overlays = useMemo<PriceOverlay[]>(() => {
    const next: PriceOverlay[] = [];
    if (effectiveLastPrice !== null && Number.isFinite(effectiveLastPrice)) {
      next.push({
        id: 'last-price',
        price: effectiveLastPrice,
        label: `${t('dashboard.kline.overlay.latest')} ${formatNumber(effectiveLastPrice)}`,
        color: '#f59e0b'
      });
    }
    if (hasPosition && position?.avgPrice != null && Number.isFinite(position.avgPrice)) {
      next.push({
        id: 'avg-price',
        price: position.avgPrice,
        label: `${t('dashboard.kline.overlay.cost')} ${formatNumber(position.avgPrice)}`,
        color: '#c084fc'
      });
    }
    if (hasPosition && riskRuleActive && stopLossPrice != null && Number.isFinite(stopLossPrice)) {
      next.push({
        id: 'stop-loss',
        price: stopLossPrice,
        label: `SL ${formatNumber(stopLossPrice)}`,
        color: '#f87171',
        dashed: true,
        draggable: Boolean(fixedRule && position),
        onDrag: fixedRule
          ? (price) => {
              setStopLossInput(price.toFixed(2));
              setDirty(true);
            }
          : undefined
      });
    }
    if (hasPosition && riskRuleActive && takeProfitPrice != null && Number.isFinite(takeProfitPrice)) {
      next.push({
        id: 'take-profit',
        price: takeProfitPrice,
        label: `TP ${formatNumber(takeProfitPrice)}`,
        color: '#60a5fa',
        dashed: true,
        draggable: Boolean(fixedRule && position),
        onDrag: fixedRule
          ? (price) => {
              setTakeProfitInput(price.toFixed(2));
              setDirty(true);
            }
          : undefined
      });
    }
    return next;
  }, [
    effectiveLastPrice,
    fixedRule,
    hasPosition,
    position,
    riskRuleActive,
    stopLossPrice,
    takeProfitPrice,
    t
  ]);

  const distributionMarkers = useMemo<EnrichedDistributionMarker[]>(
    () => {
      const sorted = [...distribution.markers].sort((a, b) => {
        if (a.percent !== b.percent) {
          return a.percent - b.percent;
        }
        return DISTRIBUTION_SORT_WEIGHT[a.key] - DISTRIBUTION_SORT_WEIGHT[b.key];
      });
      const enriched = sorted.map<EnrichedDistributionMarker>((marker) => {
        let value: string;
        if (marker.key === 'low') {
          value = formattedLow;
        } else if (marker.key === 'high') {
          value = formattedHigh;
        } else if (marker.key === 'close') {
          value = formattedLastPrice;
        } else {
          value = formatPriceWithTick(marker.value, positionSymbol);
        }
        const markerLabel = DISTRIBUTION_LABEL_MAP[marker.key];
        const tooltipValue = isFiniteNumber(marker.value)
          ? formatPriceWithTick(marker.value, positionSymbol, { tickSize: priceTickSize })
          : value;
        return {
          ...marker,
          displayValue: value,
          accessibleLabel: `${markerLabel} ${tooltipValue}`,
          tooltip: `${markerLabel}: ${tooltipValue}`,
          alignment: 'center'
        };
      });

      const percentGroups = new Map<string, number[]>();
      enriched.forEach((marker, index) => {
        const key = marker.percent.toFixed(4);
        const group = percentGroups.get(key);
        if (group) {
          group.push(index);
        } else {
          percentGroups.set(key, [index]);
        }
      });

      percentGroups.forEach((indexes) => {
        if (indexes.length <= 1) {
          return;
        }

        const alignments: MarkerAlignment[] = (() => {
          switch (indexes.length) {
            case 2:
              return ['left', 'right'];
            case 3:
              return ['farLeft', 'center', 'farRight'];
            case 4:
              return ['farLeft', 'left', 'right', 'farRight'];
            default:
              return new Array(indexes.length).fill('center');
          }
        })();

        indexes.forEach((markerIndex, orderIndex) => {
          enriched[markerIndex] = {
            ...enriched[markerIndex],
            alignment: alignments[orderIndex] ?? 'center'
          };
        });
      });

      return enriched;
    },
    [
      distribution.markers,
      formattedHigh,
      formattedLastPrice,
      formattedLow,
      positionSymbol,
      priceTickSize
    ]
  );

  const distributionOpenMarker = distribution.markers.find((marker) => marker.key === 'open') ?? null;
  const distributionCloseMarker = distribution.markers.find((marker) => marker.key === 'close') ?? null;

  const rangeRailStyle = useMemo<CSSProperties>(() => {
    const baseColor = '#0f172a';
    const openValue = distributionOpenMarker?.value ?? null;
    const closeValue = distributionCloseMarker?.value ?? null;
    if (!isFiniteNumber(openValue) || !isFiniteNumber(closeValue)) {
      return { background: baseColor };
    }
    const rawStart = Math.min(
      clampPercent(distributionOpenMarker?.percent ?? null, 0),
      clampPercent(distributionCloseMarker?.percent ?? null, 0)
    );
    const rawEnd = Math.max(
      clampPercent(distributionOpenMarker?.percent ?? null, 100),
      clampPercent(distributionCloseMarker?.percent ?? null, 100)
    );
    const highlightColor = closeValue >= openValue ? '#16a34a' : '#dc2626';
    const span = Math.abs(rawEnd - rawStart);
    const midPoint = (rawEnd + rawStart) / 2;
    const effectiveStart = span < 2 ? Math.max(0, midPoint - 1) : rawStart;
    const effectiveEnd = span < 2 ? Math.min(100, midPoint + 1) : rawEnd;
    const gradient = `linear-gradient(90deg, ${baseColor} 0%, ${baseColor} ${effectiveStart}%, ${highlightColor} ${effectiveStart}%, ${highlightColor} ${effectiveEnd}%, ${baseColor} ${effectiveEnd}%, ${baseColor} 100%)`;
    return { background: gradient };
  }, [distributionCloseMarker?.percent, distributionCloseMarker?.value, distributionOpenMarker?.percent, distributionOpenMarker?.value]);

  // 删除 DOM 与信号摘要逻辑

  const canSave = Boolean(
    fixedRule &&
      position &&
      (dirty || stopLossPrice !== resolvedStopLoss || takeProfitPrice !== resolvedTakeProfit)
  );

  const handleSaveRules = () => {
    if (!fixedRule || !riskRule || !position) {
      return;
    }
    const avg = position.avgPrice ?? 0;
    const direction = position.direction;
    const stopLossOffset =
      stopLossPrice != null && (direction === 'long' || direction === 'short')
        ? directionalOffsetFromPrice(avg, stopLossPrice, direction)
        : null;
    const takeProfitOffset =
      takeProfitPrice != null && (direction === 'long' || direction === 'short')
        ? directionalOffsetFromPrice(avg, takeProfitPrice, direction)
        : null;
    onSaveRiskRule({
      ruleId: riskRule.id,
      symbol: riskRule.symbol ?? selectedSymbol,
      enabled: riskRule.enabled,
      type: 'fixed',
      stopLossOffset,
      takeProfitOffset,
      trailingDistance: riskRule.trailingDistance ?? null,
      trailingPercent: riskRule.trailingPercent ?? null,
      maxTimeSpan: riskRule.maxTimeSpan ?? null,
      positionLimit: riskRule.positionLimit ?? null,
      lossLimit: riskRule.lossLimit ?? null,
      notes: riskRule.notes ?? null,
      atrConfig: riskRule.atrConfig ?? null
    });
  };

  const handleToggleRule = () => {
    if (!riskRule) {
      return;
    }
    onToggleRiskRule(riskRule, !riskRule.enabled);
  };

  return (
    <section className={styles.panel}>
      <div className={styles.toolbar}>
        <div className={styles.toolbarLeft}>
          <div className={styles.symbolCluster}>
            <SymbolCombobox value={selectedSymbol} symbols={symbols} onChange={onSymbolChange} />
            <div className={styles.toolbarMetrics}>
              <div className={styles.toolbarChangeValues}>
                <span className={`${styles.summaryValuePrimary} ${changeValueClass}`.trim()}>
                  {formatCurrency(changeValue)}
                </span>
                <span
                  className={`${styles.summaryValueSecondary} ${styles.summaryInlinePercent} ${changePercentClass}`.trim()}
                >
                  {changePercentInline}
                </span>
              </div>
              {distributionMarkers.length ? (
                <div className={styles.toolbarDistribution}>
                  <div className={styles.rangeTrack}>
                    <div className={styles.rangeRail} style={rangeRailStyle} />
                    {distributionMarkers.map((marker) => {
                      const markerPercent = clampPercentWithPadding(marker.percent, 6);
                      const variantKey = `rangeMarker${
                        marker.key.charAt(0).toUpperCase() + marker.key.slice(1)
                      }` as keyof typeof styles;
                      const variantClass = styles[variantKey] ?? '';
                      const alignmentKey = `rangeMarkerAlign${
                        marker.alignment.charAt(0).toUpperCase() + marker.alignment.slice(1)
                      }` as keyof typeof styles;
                      const alignmentClass = styles[alignmentKey] ?? '';
                      return (
                        <div
                          key={marker.key}
                          className={`${styles.rangeMarker} ${styles.toolbarRangeMarker} ${variantClass} ${alignmentClass}`.trim()}
                          style={{ left: `${markerPercent}%` }}
                          aria-label={marker.accessibleLabel}
                          title={marker.tooltip}
                        >
                          <span className={`${styles.rangeMarkerDot} ${styles.toolbarRangeMarkerDot}`.trim()} aria-hidden="true" />
                          <span className={`${styles.rangeMarkerLabel} ${styles.toolbarRangeMarkerLabel}`.trim()} aria-hidden="true">
                            {marker.label}
                          </span>
                          <span className={`${styles.rangeMarkerValue} ${styles.toolbarRangeMarkerValue}`.trim()} aria-hidden="true">
                            {marker.displayValue}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
        <div className={styles.toolbarActions}>
          <div className={styles.riskDropdown}>
            <button
              type="button"
              className={styles.actionButton}
              onClick={() => setRiskDropdownOpen((v) => !v)}
              aria-expanded={riskDropdownOpen}
              aria-haspopup="menu"
            >
              {t('dashboard.kline.controls.risk')}
            </button>
            <button
              type="button"
              className={styles.actionButton}
              onClick={() => onToggleMonitor()}
              aria-label={t('dashboard.kline.controls.hide_aria')}
              title={t('dashboard.kline.controls.hide')}
            >
              x
            </button>
            {riskDropdownOpen ? (
              <div className={styles.riskDropdownMenu} role="menu">
                <div className={`${styles.riskCard} ${styles.dropdownRiskCard}`.trim()}>
                  <div className={styles.riskHeader}>
                    <span>{t('dashboard.kline.risk.title')}</span>
                    <div className={styles.riskControls}>
                      <label className={styles.switch}>
                        <input
                          type="checkbox"
                          checked={Boolean(riskRule?.enabled)}
                          onChange={handleToggleRule}
                          disabled={!riskRule}
                        />
                        <span>{t('dashboard.kline.risk.enable')}</span>
                      </label>
                      <button
                        type="button"
                        className={styles.saveButton}
                        onClick={() => {
                          handleSaveRules();
                          setRiskDropdownOpen(false);
                        }}
                        disabled={!canSave || riskRuleSaving}
                      >
                        {t('dashboard.kline.risk.save')}
                      </button>
                    </div>
                  </div>
                  <div className={styles.riskMeta}>
                    {riskRule
                      ? `${t('dashboard.kline.risk.meta.type_prefix')}${
                          riskRule.type === 'atr_trailing'
                            ? t('dashboard.kline.risk.type_labels.atr_trailing')
                            : riskRule.type === 'trailing'
                              ? t('dashboard.kline.risk.type_labels.trailing')
                              : t('dashboard.kline.risk.type_labels.fixed')
                        }${riskRule.enabled ? '' : t('dashboard.kline.risk.meta.disabled_suffix')}`
                      : t('dashboard.kline.risk.meta.none')}
                  </div>
                  <div className={styles.riskFields}>
                    <div className={`${styles.riskField} ${styles.riskStopLoss}`.trim()}>
                      <span className={styles.riskFieldLabel}>{t('dashboard.kline.risk.fields.stop_loss')}</span>
                      <div className={styles.riskFieldValue}>
                        {fixedRule ? (
                          <input
                            type="number"
                            className={styles.riskInput}
                            value={stopLossInput}
                            step="0.01"
                            placeholder="—"
                            onChange={(event) => {
                              setStopLossInput(event.target.value);
                              setDirty(true);
                            }}
                            disabled={!position}
                          />
                        ) : (
                          <span className={styles.readonlyValue}>{formatNumber(resolvedStopLoss)}</span>
                        )}
                      </div>
                      <div className={styles.riskFieldDelta}>
                        <span className={stopLossDeltaClass}>{formatSignedNumber(stopLossDelta)}</span>
                        <span className={stopLossPercentClass}>{formatPercent(stopLossPercent)}</span>
                      </div>
                    </div>
                    <div className={`${styles.riskField} ${styles.riskTakeProfit}`.trim()}>
                      <span className={styles.riskFieldLabel}>{t('dashboard.kline.risk.fields.take_profit')}</span>
                      <div className={styles.riskFieldValue}>
                        {fixedRule ? (
                          <input
                            type="number"
                            className={styles.riskInput}
                            value={takeProfitInput}
                            step="0.01"
                            placeholder="—"
                            onChange={(event) => {
                              setTakeProfitInput(event.target.value);
                              setDirty(true);
                            }}
                            disabled={!position}
                          />
                        ) : (
                          <span className={styles.readonlyValue}>{formatNumber(resolvedTakeProfit)}</span>
                        )}
                      </div>
                      <div className={styles.riskFieldDelta}>
                        <span className={takeProfitDeltaClass}>{formatSignedNumber(takeProfitDelta)}</span>
                        <span className={takeProfitPercentClass}>{formatPercent(takeProfitPercent)}</span>
                      </div>
                    </div>
                  </div>
                  <div className={styles.riskSummary}>
                    <div className={`${styles.riskSummaryItem} ${styles.riskSummaryLoss}`.trim()}>
                      <span className={styles.riskSummaryLabel}>{t('dashboard.kline.risk.summary.stop_loss_expectation')}</span>
                      <span className={`${styles.riskSummaryValue} ${stopLossExpectationClass}`.trim()}>
                        {formatCurrency(stopLossExpectation)}
                      </span>
                    </div>
                    <div className={`${styles.riskSummaryItem} ${styles.riskSummaryCenter}`.trim()}>
                      <span className={styles.riskSummaryLabel}>{t('dashboard.kline.risk.summary.rrr')}</span>
                      <span className={styles.riskSummaryValue}>{riskRewardDisplay}</span>
                    </div>
                    <div className={`${styles.riskSummaryItem} ${styles.riskSummaryProfit}`.trim()}>
                      <span className={styles.riskSummaryLabel}>{t('dashboard.kline.risk.summary.take_profit_expectation')}</span>
                      <span className={`${styles.riskSummaryValue} ${takeProfitExpectationClass}`.trim()}>
                        {formatCurrency(takeProfitExpectation)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>
      <div className={styles.body}>
        {/* DOM 趋势、信号与内联风控面板已移除；风控功能已迁移至工具栏下拉 */}
        <div className={styles.chartStack}>
          <div className={styles.chartHeader}>
            <div className={styles.chartHeaderTop}>
              <span>{t('dashboard.kline.title')}</span>
              <div className={styles.chartControls}>
                <div className={styles.chartControlGroup}>
                  {timeframes.map((timeframe) => (
                    <button
                      key={timeframe.value}
                      type="button"
                      className={`${styles.compactButton} ${
                        timeframe.value === selectedTimeframe ? styles.compactButtonActive : ''
                      }`.trim()}
                      onClick={() => onTimeframeChange(timeframe.value)}
                    >
                      {timeframeLabelMap[timeframe.value] ?? timeframe.label}
                    </button>
                  ))}
                </div>
                <div className={styles.chartControlGroup}>
                  {DURATION_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      className={`${styles.compactButton} ${
                        option.value === selectedDuration ? styles.compactButtonActive : ''
                      }`.trim()}
                      onClick={() => onDurationChange(option.value)}
                    >
                      {durationLabelMap[option.value] ?? option.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className={styles.subscriptionStatusBlock}>
              <div className={styles.subscriptionStatusLine}>
                {(() => {
                  const segments: Array<{ key: string; node: ReactNode }> = [
                    {
                      key: 'mode',
                      node: <span className={styles.subscriptionMode}>{t('dashboard.kline.subscription.mode_ws')}</span>
                    }
                  ];

                  if (subscriptionNotice) {
                    segments.push({
                      key: 'notice',
                      node: <span className={styles.subscriptionHint}>{subscriptionNotice}</span>
                    });
                  }

                  if (realtimeConnectionStatus === 'connecting') {
                    segments.push({
                      key: 'connecting',
                      node: <span className={styles.subscriptionPending}>{t('dashboard.kline.subscription.connecting')}</span>
                    });
                  }

                  if (realtimeConnectionStatus === 'reconnecting') {
                    segments.push({
                      key: 'reconnecting',
                      node: <span className={styles.subscriptionPending}>{t('dashboard.kline.subscription.reconnecting')}</span>
                    });
                  }

                  if (subscriptionStatus === 'pending') {
                    const pendingSymbol = subscriptionMeta?.symbol ?? selectedSymbol;
                    const pendingTimeframe = subscriptionMeta?.timeframe ?? selectedTimeframe ?? '';
                    segments.push({
                      key: 'pending-info',
                      node: (
                        <span className={styles.subscriptionPending}>
                          {t('dashboard.kline.subscription.pending_info', { symbol: pendingSymbol })}
                          {pendingTimeframe ? ` · ${pendingTimeframe}` : ''}
                        </span>
                      )
                    });
                    segments.push({
                      key: 'pending-action',
                      node: (
                        <span className={styles.subscriptionPending}>
                          {t('dashboard.kline.subscription.pending_action', { symbol: pendingSymbol })}
                        </span>
                      )
                    });
                  }

                  if (subscriptionStatus === 'ready') {
                    segments.push({
                      key: 'ready',
                      node: (
                        <span className={styles.subscriptionMeta}>
                          {t('dashboard.kline.subscription.ready_lead')}
                          {subscriptionMeta?.symbol ? ` · ${subscriptionMeta.symbol}` : ''}
                          {subscriptionMeta?.timeframe ? ` · ${subscriptionMeta.timeframe}` : ''}
                          {subscriptionMeta?.id ? ` · ID ${subscriptionMeta.id}` : ''}
                        </span>
                      )
                    });
                  }

                  if (subscriptionStatus === 'failed' && realtimeConnectionStatus !== 'failed') {
                    segments.push({
                      key: 'subscription-failed',
                      node: (
                        <span className={styles.subscriptionError}>
                          {t('dashboard.kline.subscription.failed_prefix')}
                          {subscriptionError ?? t('dashboard.kline.subscription.failed_hint_default')}
                        </span>
                      )
                    });
                  }

                  return segments.map((segment, index) => (
                    <span key={segment.key} className={styles.subscriptionStatusItem}>
                      {index > 0 ? <span className={styles.subscriptionSeparator}>·</span> : null}
                      {segment.node}
                    </span>
                  ));
                })()}
              </div>

              {realtimeConnectionStatus === 'failed' ? (
                <div className={styles.connectionFailedRow}>
                  <span className={styles.subscriptionError}>
                    {t('dashboard.kline.subscription.ws_failed_prefix')}
                    {subscriptionError ? `：${subscriptionError}` : ''}
                  </span>
                  <button
                    type="button"
                    className={styles.connectionRetryButton}
                    onClick={onRetryConnection}
                  >
                    {t('dashboard.kline.subscription.retry_connect')}
                  </button>
                </div>
              ) : null}
            </div>
          </div>
          <CandlestickChart bars={bars} overlays={overlays} />
          <div className={styles.availability}>{formatTimeRange(availability)}</div>
          <div className={styles.chartFooter}>
            <div className={styles.footerCard}>
              <span className={styles.footerLabel}>{t('dashboard.kline.footer.reference')}</span>
              <span className={styles.footerValue}>{formatNumber(referencePrice)}</span>
            </div>
            <div className={styles.footerCard}>
              <span className={styles.footerLabel}>{t('dashboard.kline.footer.high_low')}</span>
              <span className={styles.footerValue}>
                {formatNumber(latestBar?.high)} / {formatNumber(latestBar?.low)}
              </span>
            </div>
            <div className={styles.footerCard}>
              <span className={styles.footerLabel}>{t('dashboard.kline.footer.volume')}</span>
              <span className={styles.footerValue}>{formatVolume(latestBar?.volume ?? ticker?.lastSize ?? null)}</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export default MarketMonitorPanel;
