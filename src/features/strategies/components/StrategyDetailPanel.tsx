import type { ChangeEvent, KeyboardEvent, MouseEvent } from 'react';
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import clsx from 'clsx';
import type {
  StrategyFallbackMode,
  StrategyItem,
  StrategyMetricsSnapshot,
  StrategyPerformanceSnapshot,
  StrategyPerformanceSection,
  StrategyDetailSummary,
  StrategyParameterConfig,
  StrategyRiskSettings,
  StrategyRiskLogEntry,
  StrategyRiskLogCheckStatus,
  StrategyRuntimeDetail,
  StrategyPerformancePoint,
  StrategyDistributionPoint,
  StrategyPnLCalendar,
  StrategyCandlesSnapshot,
  MarketBar,
  TradeMarker
} from '@features/dashboard/types';
import CandlestickChart from '@features/dashboard/components/CandlestickChart';
import { useAppDispatch, useAppSelector } from '@store/hooks';
import {
  loadStrategyPerformanceSummary,
  loadStrategyPerformanceOrders,
  loadStrategyPerformanceCharts,
  loadStrategyPerformanceCalendar,
  loadStrategyDetail,
  loadStrategyRuntime,
  updateStrategySummarySettings,
  loadStrategyRiskSettings,
  saveStrategyRiskSettings,
  loadStrategyRiskLogs,
  loadStrategyCandles,
  updateStrategyParameters,
  resyncStrategySubscription
} from '@store/thunks/strategies';
import type { RequestStatus } from '@store/slices/strategiesSlice';
import { addToast } from '@store/slices/toastSlice';
import { startMarketSubscription, type MarketSubscriptionStartPayload } from '@services/marketApi';
import { formatTimestamp } from './formatTimestamp';
import styles from './StrategyDetailPanel.module.css';
import { useTranslation } from '@i18n';
import { buildSparklinePath, buildMonthCells } from './visualUtils';
import { computeFixedRrTargets } from './exitTargets';
import VolatilityRegimeMultipliersModal from './VolatilityRegimeMultipliersModal';
import DisabledRegimesModal from './DisabledRegimesModal';
import KlineSummarySection from './kline/KlineSummarySection';
import DynamicOrbRuntimePanel from './DynamicOrbRuntimePanel';
import { DEFAULT_TIMEZONE as DEFAULT_SCHEDULE_TIMEZONE, getTimezoneOptions } from '../utils/timezoneOptions';
import { buildPeriodRange, buildZonedDate, getLocalTimezone, getZonedDateParts } from '../utils/dateAggregation';
import {
  buildDomRuntimeMetrics,
  DomRuntimeMetricsViewModel,
  buildKlineRuntimeMetrics,
  KlineRuntimeMetricsViewModel,
  formatDataFeedHint,
  formatReceivingStatus,
  formatRuntimeSeconds,
  formatStopPrice,
  RuntimeLogTone,
  type RuntimeLogEntry
} from './runtimeMetrics';
import { includesKeyword, KLINE_KEYWORDS } from './strategyKeywords';
import { isScreenerStrategy as checkIsScreenerStrategy } from '../utils/strategyKind';
import ScreenerDetailPanel from './ScreenerDetailPanel';

export { formatTimestamp } from './formatTimestamp';

type DetailTab = 'summary' | 'risk' | 'orders' | 'visual' | 'candles' | 'calendar' | 'screener';

type MetricValue = number | string | null | undefined;

interface DistributionBin {
  label: string;
  count: number;
  midpoint: number;
}

const DEFAULT_DISTRIBUTION_BIN_COUNT = 12;
const RUNTIME_PHASE_LOG_LIMIT = 3;

const extractNumericValues = (label: string): number[] => {
  if (!label) {
    return [];
  }
  const cleaned = label.replace(/,/g, '');
  const matches = cleaned.match(/-?\d+(?:\.\d+)?/g);
  if (!matches) {
    return [];
  }
  return matches
    .map((token) => Number(token))
    .filter((value): value is number => Number.isFinite(value));
};

const formatRangeNumber = (value: number): string => {
  const abs = Math.abs(value);
  const maximumFractionDigits = abs >= 100 ? 0 : abs >= 10 ? 1 : abs >= 1 ? 2 : 3;
  const normalized = Object.is(value, -0) ? 0 : value;
  return normalized.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits
  });
};

const formatRangeLabel = (start: number, end: number): string => {
  return `${formatRangeNumber(start)} ~ ${formatRangeNumber(end)}`;
};

const buildDistributionBins = (
  points: StrategyDistributionPoint[],
  binCount = DEFAULT_DISTRIBUTION_BIN_COUNT
): DistributionBin[] => {
  if (!points.length || binCount <= 0) {
    return [];
  }

  const entries = points
    .map((point) => {
      const { bucket, value } = point;
      if (!Number.isFinite(value)) {
        return null;
      }
      const numericValues = extractNumericValues(bucket);
      if (!numericValues.length) {
        return null;
      }
      const rangeStart = Math.min(...numericValues);
      const rangeEnd = Math.max(...numericValues);
      const midpoint = (rangeStart + rangeEnd) / 2;
      return {
        rangeStart,
        rangeEnd,
        midpoint,
        count: value
      };
    })
    .filter((item): item is { rangeStart: number; rangeEnd: number; midpoint: number; count: number } =>
      Boolean(item)
    );

  if (!entries.length) {
    return [];
  }

  let minValue = Math.min(...entries.map((entry) => entry.rangeStart));
  let maxValue = Math.max(...entries.map((entry) => entry.rangeEnd));

  if (!Number.isFinite(minValue) || !Number.isFinite(maxValue)) {
    return [];
  }

  if (minValue === maxValue) {
    const padding = Math.max(Math.abs(minValue) * 0.1, 1);
    minValue -= padding;
    maxValue += padding;
  }

  const rangeWidth = maxValue - minValue;
  const step = rangeWidth / binCount;
  if (!Number.isFinite(step) || step <= 0) {
    return [];
  }

  const bins = Array.from({ length: binCount }, (_, index) => {
    const start = minValue + step * index;
    const end = index === binCount - 1 ? maxValue : start + step;
    return {
      start,
      end,
      midpoint: (start + end) / 2,
      count: 0
    };
  });

  entries.forEach(({ midpoint, count }) => {
    if (!Number.isFinite(midpoint) || !Number.isFinite(count)) {
      return;
    }
    const relative = (midpoint - minValue) / rangeWidth;
    const index = Math.min(
      binCount - 1,
      Math.max(0, Math.floor(relative * binCount))
    );
    bins[index].count += count;
  });

  return bins.map((bin) => ({
    label: formatRangeLabel(bin.start, bin.end),
    count: bin.count,
    midpoint: bin.midpoint
  }));
};

type RegimeKey = 'low' | 'normal' | 'high';

const REGIME_KEYS: RegimeKey[] = ['low', 'normal', 'high'];

type RegimeMultiplierPayload = Record<RegimeKey, number>;
type RegimeMultiplierDraft = Partial<Record<RegimeKey, number>>;

interface VolatilityEditorState {
  open: boolean;
  definition: StrategyParameterConfig | null;
  initialValue: RegimeMultiplierDraft;
  error: string | null;
}

interface DisabledRegimesEditorState {
  open: boolean;
  definition: StrategyParameterConfig | null;
  initialValue: RegimeKey[];
  error: string | null;
}

const extractRegimeMultiplierValues = (value: unknown): RegimeMultiplierDraft => {
  if (!value || typeof value !== 'object') {
    return {};
  }
  const record = value as Record<string, unknown>;
  return REGIME_KEYS.reduce<RegimeMultiplierDraft>((accumulator, key) => {
    const raw = record[key];
    if (typeof raw === 'number' && Number.isFinite(raw)) {
      accumulator[key] = raw;
      return accumulator;
    }
    if (typeof raw === 'string') {
      const parsed = Number.parseFloat(raw);
      if (Number.isFinite(parsed)) {
        accumulator[key] = parsed;
      }
    }
    return accumulator;
  }, {});
};

const extractDisabledRegimeValues = (value: unknown): RegimeKey[] => {
  if (!value) {
    return [];
  }
  const candidates: string[] = Array.isArray(value)
    ? value.map((item) => String(item))
    : typeof value === 'string'
      ? value.split(',')
      : [];
  return candidates
    .map((item) => item.trim().toLowerCase())
    .filter((item): item is RegimeKey => REGIME_KEYS.includes(item as RegimeKey));
};

interface StrategyDetailPanelProps {
  strategy: StrategyItem | null;
  metrics: StrategyMetricsSnapshot | null;
  performance: StrategyPerformanceSnapshot | null;
  fallbackMode: StrategyFallbackMode;
  initialTab?: DetailTab;
  selectedPeriod?: string;
  onSelectedPeriodChange?: (value: string) => void;
  headerExpanded?: boolean;
  active?: boolean;
}

export const PERIOD_OPTIONS: Array<{ label: string; value: string }> = [
  { label: '1 Day', value: 'day' },
  { label: '1 Week', value: '7d' },
  { label: '1 Month', value: '30d' },
  { label: '3 Months', value: '90d' },
  { label: '6 Months', value: '180d' },
  { label: '1 Year', value: 'year' },
  { label: 'All', value: 'all' }
];

const KLINE_INTERVAL_PARAMETER_NAMES = ['timeframe', 'bar_interval', 'barInterval', 'interval', 'time_frame'];
const KLINE_LOOKBACK_PARAMETER_NAMES = ['lookback', 'lookback_window', 'window', 'history'];
const KLINE_AGGREGATION_PARAMETER_NAMES = ['aggregation', 'aggregation_window', 'bars_per_aggregation', 'batch_size'];

type KlineOptionSource = { label: string; value: string | number | boolean };

const DEFAULT_KLINE_INTERVAL_OPTIONS: KlineOptionSource[] = [
  { label: '1 Minute', value: '1m' },
  { label: '3 Minutes', value: '3m' },
  { label: '5 Minutes', value: '5m' },
  { label: '15 Minutes', value: '15m' },
  { label: '30 Minutes', value: '30m' },
  { label: '1 Hour', value: '1h' },
  { label: '4 Hours', value: '4h' },
  { label: '1 Day', value: '1d' },
  { label: '1 Month', value: '1mo' },
  { label: '1 Year', value: '1y' }
];

const DEFAULT_KLINE_LOOKBACK_OPTIONS: KlineOptionSource[] = [
  { label: '7 Days', value: '7d' },
  { label: '14 Days', value: '14d' },
  { label: '30 Days', value: '30d' },
  { label: '90 Days', value: '90d' },
  { label: '180 Days', value: '180d' },
  { label: '365 Days', value: '365d' }
];

const DEFAULT_KLINE_AGGREGATION_OPTIONS: KlineOptionSource[] = [
  { label: 'VWAP', value: 'VWAP' },
  { label: 'OHLC', value: 'OHLC' },
  { label: 'EMA', value: 'EMA' },
  { label: 'SMA', value: 'SMA' }
];

const KPI_CONFIG: Array<{
  label: string;
  keys: string[];
  format?: 'currency' | 'percent' | 'number' | 'duration';
}> = [
  { label: 'PnL', keys: ['total_pnl', 'pnl', 'net_pnl'], format: 'currency' },
  {
    label: 'Commission',
    keys: [
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
    ],
    format: 'currency'
  },
  { label: 'Win Rate', keys: ['win_rate', 'winRate'], format: 'percent' },
  { label: 'Max Drawdown', keys: ['max_drawdown', 'drawdown_max'], format: 'currency' },
  { label: 'Sharpe', keys: ['sharpe', 'sharpe_ratio'], format: 'number' },
  { label: 'Trades', keys: ['trade_count', 'trades'], format: 'number' },
  {
    label: 'Avg Duration',
    keys: ['avg_trade_duration', 'avg_trade_duration_seconds', 'avg_duration_seconds'],
    format: 'duration'
  }
];

const DATA_SOURCE_LABELS: Record<string, string> = {
  'market-data': 'Market Data Feed',
  'historical-cache': 'Historical Cache',
  'simulated-feed': 'Simulated Feed',
  'external-provider': 'External Provider'
};

const getDataSourceLabel = (value: string | null | undefined): string | null => {
  if (!value) {
    return null;
  }
  const normalized = value.trim();
  if (!normalized) {
    return null;
  }
  return DATA_SOURCE_LABELS[normalized] ?? normalized;
};

const CANDLE_INTERVAL_OPTIONS: Array<{ label: string; value: string }> = [
  { label: '1 Min', value: '1m' },
  { label: '5 Min', value: '5m' },
  { label: '15 Min', value: '15m' },
  { label: '1 Hour', value: '1h' }
];

const ORDERS_PAGE_SIZE = 10;

const STRATEGY_FILE_BASE = 'src/strategies';

const SUBSCRIPTION_PARAMETER_NAMES = new Set(['symbol', 'subscription_id', 'dom_channel', 'redis_channel_prefix']);

const FUTURE_METADATA_KEY_MAP = {
  secType: ['sec_type', 'sectype', 'sectype'],
  exchange: ['exchange'],
  currency: ['currency'],
  primaryExchange: ['primary_exchange', 'primaryexchange'],
  localSymbol: ['local_symbol', 'localsymbol', 'ib_local_symbol', 'iblocalsymbol'],
  tradingClass: ['trading_class', 'tradingclass', 'ib_trading_class', 'ibtradingclass'],
  contractMonth: ['contract_month', 'contractmonth'],
  lastTradeDateOrContractMonth: [
    'lasttradedateorcontractmonth',
    'last_trade_date_or_contract_month',
    'last_trade_date',
    'lasttradedate',
    'expiry',
    'expiration',
    'expirationdate',
    'expirydate'
  ],
  multiplier: ['multiplier', 'contract_multiplier', 'contractmultiplier', 'ib_multiplier', 'ibmultiplier'],
  conId: [
    'con_id',
    'conid',
    'contract_id',
    'contractid',
    'ib_contract_id',
    'ibcontractid'
  ]
} as const;

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
};

const toParameterRecord = (
  parameters: StrategyParameterConfig[] | null | undefined
): Record<string, unknown> | null => {
  if (!parameters || parameters.length === 0) {
    return null;
  }
  const record: Record<string, unknown> = {};
  parameters.forEach((parameter) => {
    if (!parameter || typeof parameter.name !== 'string') {
      return;
    }
    const key = parameter.name;
    if (record[key] !== undefined) {
      return;
    }
    const value =
      parameter.value !== undefined && parameter.value !== null
        ? parameter.value
        : parameter.defaultValue !== undefined
          ? parameter.defaultValue
          : null;
    record[key] = value as unknown;
  });
  return Object.keys(record).length ? record : null;
};

const normalizeExitConfigDefinitions = (
  exitConfig: Array<Record<string, unknown>> | null | undefined
): StrategyParameterConfig[] => {
  if (!Array.isArray(exitConfig) || exitConfig.length === 0) {
    return [];
  }
  return exitConfig
    .map((item) => {
      const name =
        typeof item.name === 'string' ? item.name :
        typeof (item as Record<string, unknown>).key === 'string' ? ((item as Record<string, unknown>).key as string) :
        typeof (item as Record<string, unknown>).field === 'string' ? ((item as Record<string, unknown>).field as string) :
        typeof (item as Record<string, unknown>).parameter === 'string' ? ((item as Record<string, unknown>).parameter as string) :
        typeof (item as Record<string, unknown>).id === 'string' ? ((item as Record<string, unknown>).id as string) :
        null;
      if (!name) {
        return null;
      }
      const labelSource = (item as Record<string, unknown>).label ?? (item as Record<string, unknown>).title ?? (item as Record<string, unknown>).hint ?? null;
      const label = typeof labelSource === 'string' && labelSource.trim() ? labelSource : name;
      const rawType = (item as Record<string, unknown>).type ?? (item as Record<string, unknown>).kind;
      let type = typeof rawType === 'string' ? rawType : 'string';
      const rawValue = (item as Record<string, unknown>).value ?? (item as Record<string, unknown>).current ?? (item as Record<string, unknown>).selected ?? (item as Record<string, unknown>).default;
      const value = rawValue;
      const rawChoices = (item as Record<string, unknown>).choices ?? (item as Record<string, unknown>).options ?? (item as Record<string, unknown>).values ?? null;
      const options = Array.isArray(rawChoices)
        ? rawChoices.map((choice) => {
            if (choice && typeof choice === 'object') {
              const c = choice as Record<string, unknown>;
              const v = c.value ?? c.id ?? c.key ?? c.code ?? c.name ?? null;
              const l = c.label ?? c.title ?? c.name ?? (v != null ? String(v) : '');
              let normalizedValue: string | number | boolean;
              if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
                normalizedValue = v;
              } else {
                normalizedValue = typeof l === 'string' ? l : String(l ?? '');
              }
              const normalizedLabel = typeof l === 'string' ? l : String(normalizedValue);
              return { value: normalizedValue, label: normalizedLabel };
            }
            const normalizedLabel = typeof choice === 'string' ? choice : String(choice);
            const normalizedValue: string | number | boolean =
              typeof choice === 'string' || typeof choice === 'number' || typeof choice === 'boolean'
                ? choice
                : normalizedLabel;
            return { value: normalizedValue, label: normalizedLabel };
          })
        : null;
      if (!rawType && Array.isArray(options) && options.length) {
        type = 'select';
      }
      return {
        name,
        label,
        type,
        value,
        defaultValue: value,
        description:
          typeof (item as Record<string, unknown>).description === 'string' ? ((item as Record<string, unknown>).description as string) : null,
        options,
        min: typeof (item as Record<string, unknown>).min === 'number' ? ((item as Record<string, unknown>).min as number) : null,
        max: typeof (item as Record<string, unknown>).max === 'number' ? ((item as Record<string, unknown>).max as number) : null,
        step: typeof (item as Record<string, unknown>).step === 'number' ? ((item as Record<string, unknown>).step as number) : null
      } satisfies StrategyParameterConfig;
    })
    .filter(Boolean) as StrategyParameterConfig[];
};

const extractExitConfigFromParameters = (
  parameters: Record<string, unknown> | null | undefined
): StrategyParameterConfig[] => {
  if (!parameters || typeof parameters !== 'object') {
    return [];
  }
  const candidates: StrategyParameterConfig[] = [];
  const keys = ['exit_config', 'ExitConfig', 'exitConfig'];
  for (const k of keys) {
    const raw = (parameters as Record<string, unknown>)[k];
    if (!raw) continue;
    if (Array.isArray(raw)) {
      const normalized = normalizeExitConfigDefinitions(raw as Array<Record<string, unknown>>);
      if (normalized.length) return normalized;
    } else if (typeof raw === 'object') {
      const obj = raw as Record<string, unknown>;
      const allowed = new Set(['mode', 'risk_amount', 'rr_ratio', 'atr_length', 'atr_multiplier', 'trailing_multiplier']);
      for (const [name, value] of Object.entries(obj)) {
        const lower = name.toLowerCase();
        if (!allowed.has(lower)) {
          continue;
        }
        const type = lower === 'atr_length' ? 'int' : lower === 'mode' ? 'select' : 'float';
        let options: StrategyParameterConfig['options'] = null;
        if (lower === 'mode') {
          options = [
            { label: '无', value: 'none' },
            { label: '固定RR', value: 'fixed_rr' },
            { label: 'ATR', value: 'atr' },
            { label: 'Trail ATR', value: 'trailing_atr' }
          ];
        }
        candidates.push({
          name,
          label: name,
          type,
          value,
          defaultValue: value,
          description: null,
          options,
          min: null,
          max: null,
          step: null
        });
      }
    }
  }
  return candidates;
};

const findValueInSources = (sources: unknown[], keys: readonly string[]): unknown => {
  if (!keys.length) {
    return undefined;
  }
  const targetKeys = keys.map((key) => key.toLowerCase());
  const queue: unknown[] = [...sources];
  const visited = new Set<unknown>();
  while (queue.length) {
    const current = queue.shift();
    if (!current || typeof current !== 'object') {
      continue;
    }
    if (visited.has(current)) {
      continue;
    }
    visited.add(current);
    if (Array.isArray(current)) {
      queue.push(...current);
      continue;
    }
    for (const [rawKey, value] of Object.entries(current as Record<string, unknown>)) {
      const normalizedKey = rawKey.toLowerCase();
      if (targetKeys.includes(normalizedKey)) {
        if (value !== undefined && value !== null && value !== '') {
          return value;
        }
      }
      if (value && typeof value === 'object') {
        queue.push(value);
      }
    }
  }
  return undefined;
};

const normalizeStringValue = (value: unknown): string | null => {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }
  if (typeof value === 'number') {
    if (Number.isNaN(value)) {
      return null;
    }
    return value.toString();
  }
  return null;
};

const normalizeUpperString = (value: unknown): string | null => {
  const normalized = normalizeStringValue(value);
  return normalized ? normalized.toUpperCase() : null;
};

const normalizeExpiryString = (value: unknown): string | null => {
  const normalized = normalizeStringValue(value);
  return normalized ? normalized.replace(/\s+/g, '') : null;
};

const normalizeMultiplierValue = (value: unknown): number | string | null => {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }
    const numeric = Number(trimmed);
    if (!Number.isNaN(numeric)) {
      return numeric;
    }
    return trimmed;
  }
  return null;
};

const normalizeConIdValue = (value: unknown): number | string | null => {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? Math.trunc(value) : null;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }
    const parsed = Number(trimmed);
    if (Number.isFinite(parsed)) {
      return Math.trunc(parsed);
    }
    return trimmed;
  }
  return null;
};

interface StrategyInstrumentMetadata {
  secType: string | null;
  exchange: string | null;
  currency: string | null;
  primaryExchange: string | null;
  localSymbol: string | null;
  tradingClass: string | null;
  contractMonth: string | null;
  lastTradeDateOrContractMonth: string | null;
  multiplier: number | string | null;
  conId: number | string | null;
  contract: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
}

const extractStrategyInstrumentMetadata = (
  detailParameters: Record<string, unknown> | null,
  strategyParameters: StrategyParameterConfig[] | null | undefined,
  runtime: StrategyRuntimeDetail | null
): StrategyInstrumentMetadata => {
  const sources: unknown[] = [];
  if (detailParameters) {
    sources.push(detailParameters);
    const nestedMetadata = detailParameters.metadata;
    if (isRecord(nestedMetadata)) {
      sources.push(nestedMetadata);
    }
  }
  const parameterRecord = toParameterRecord(strategyParameters);
  if (parameterRecord) {
    sources.push(parameterRecord);
  }
  if (runtime?.snapshot) {
    sources.push(runtime.snapshot);
    const snapshotRecord = runtime.snapshot as Record<string, unknown>;
    const runtimeMetadata = snapshotRecord.metadata;
    if (isRecord(runtimeMetadata)) {
      sources.push(runtimeMetadata);
    }
    if (isRecord(runtime.snapshot.data_push)) {
      sources.push(runtime.snapshot.data_push as Record<string, unknown>);
    }
  }

  const secType = normalizeUpperString(findValueInSources(sources, FUTURE_METADATA_KEY_MAP.secType));
  const exchange = normalizeUpperString(findValueInSources(sources, FUTURE_METADATA_KEY_MAP.exchange));
  const currency = normalizeUpperString(findValueInSources(sources, FUTURE_METADATA_KEY_MAP.currency));
  const primaryExchange = normalizeUpperString(
    findValueInSources(sources, FUTURE_METADATA_KEY_MAP.primaryExchange)
  );
  const localSymbol = normalizeUpperString(
    findValueInSources(sources, FUTURE_METADATA_KEY_MAP.localSymbol)
  );
  const tradingClass = normalizeUpperString(
    findValueInSources(sources, FUTURE_METADATA_KEY_MAP.tradingClass)
  );
  const contractMonth = normalizeExpiryString(
    findValueInSources(sources, FUTURE_METADATA_KEY_MAP.contractMonth)
  );
  const lastTradeDateOrContractMonth = normalizeExpiryString(
    findValueInSources(sources, FUTURE_METADATA_KEY_MAP.lastTradeDateOrContractMonth)
  );
  const multiplier = normalizeMultiplierValue(
    findValueInSources(sources, FUTURE_METADATA_KEY_MAP.multiplier)
  );
  const conId = normalizeConIdValue(findValueInSources(sources, FUTURE_METADATA_KEY_MAP.conId));

  let contract: Record<string, unknown> | null = null;
  const contractCandidate = findValueInSources(sources, ['contract']);
  if (contractCandidate && typeof contractCandidate === 'object' && !Array.isArray(contractCandidate)) {
    contract = contractCandidate as Record<string, unknown>;
  }

  const metadata: Record<string, unknown> = {};
  if (secType === 'FUT') {
    if (lastTradeDateOrContractMonth) {
      metadata.lastTradeDateOrContractMonth = lastTradeDateOrContractMonth;
    }
    if (contractMonth) {
      metadata.contractMonth = contractMonth;
    }
    if (tradingClass) {
      metadata.tradingClass = tradingClass;
    }
    if (localSymbol) {
      metadata.localSymbol = localSymbol;
    }
    if (multiplier !== null) {
      metadata.multiplier = multiplier;
    }
  }
  if (conId !== null) {
    metadata.con_id = conId;
  }

  return {
    secType,
    exchange,
    currency,
    primaryExchange,
    localSymbol,
    tradingClass,
    contractMonth,
    lastTradeDateOrContractMonth,
    multiplier,
    conId,
    contract,
    metadata: Object.keys(metadata).length ? metadata : null
  };
};

type ParameterBlueprint = Omit<StrategyParameterConfig, 'value'> & {
  allow_null?: boolean;
};

const DOM_STRUCTURE_PARAMETER_BLUEPRINTS: ParameterBlueprint[] = [
  {
    name: 'cooldown_seconds',
    label: 'Signal Cooldown (s)',
    type: 'float',
    min: 0,
    max: 900,
    defaultValue: 15,
    description: 'Seconds to wait after signalling before evaluating again.'
  },
  {
    name: 'max_loss_streak',
    label: 'Breaker (Max Loss Streak)',
    type: 'int',
    min: 1,
    max: 10,
    defaultValue: 3,
    description: 'Number of consecutive losing trades allowed before pausing signals.'
  },
  {
    name: 'signal_frequency_seconds',
    label: 'Execution Frequency (s)',
    type: 'float',
    min: 0,
    max: 1800,
    defaultValue: 60,
    description: 'Minimum spacing in seconds between emitted signals.'
  },
  {
    name: 'default_quantity',
    label: 'Fallback Quantity',
    type: 'float',
    min: 0.1,
    max: 100,
    defaultValue: 1,
    description: 'Order size used when risk controls do not override position sizing.'
  },
  {
    name: 'min_processing_interval',
    label: 'Metrics Sampling Interval (s)',
    type: 'float',
    min: 0,
    max: 1,
    defaultValue: 0.05,
    description: 'Throttle interval for processing incoming DOM snapshots.'
  },
  {
    name: 'trend_threshold',
    label: 'Trend Score Threshold',
    type: 'float',
    allow_null: true,
    min: 0,
    max: 5,
    defaultValue: 0.5,
    description: 'Minimum DOM trend score (OBI-based) required; set null to disable.'
  },
  {
    name: 'structure_window_seconds',
    label: 'Structure Window (s)',
    type: 'float',
    min: 1,
    max: 120,
    defaultValue: 10,
    description: 'Lookback window used to derive support/resistance zones.'
  },
  {
    name: 'structure_tolerance_ticks',
    label: 'Zone Tolerance (ticks)',
    type: 'float',
    min: 0,
    max: 10,
    defaultValue: 2,
    description: 'Tick offset accepted when matching mid price to structure levels.'
  },
  {
    name: 'min_signal_conditions',
    label: 'Confirmation Count',
    type: 'int',
    min: 1,
    max: 6,
    defaultValue: 3,
    description: 'Number of confirmation conditions that must hold before signalling.'
  },
  {
    name: 'depth_levels',
    label: 'Depth Levels',
    type: 'int',
    min: 1,
    max: 40,
    defaultValue: 10,
    description: 'Number of DOM levels requested from the service.'
  },
  {
    name: 'stacking_intensity_threshold',
    label: 'Stacking Threshold (contracts)',
    type: 'float',
    min: 0,
    max: 500,
    defaultValue: 15,
    description: 'Minimum increase in resting depth on the signal side within the structure window.'
  },
  {
    name: 'ofi_threshold',
    label: 'Order Flow Threshold',
    type: 'float',
    min: 0,
    max: 500,
    defaultValue: 6,
    description: 'Absolute order flow imbalance required in favour of the trade direction.'
  },
  {
    name: 'obi_long_threshold',
    label: 'Long OBI Threshold',
    type: 'float',
    min: 0,
    max: 1,
    step: 0.01,
    defaultValue: 0.58,
    description: 'Minimum order book imbalance ratio (0-1) favouring bids before going long.'
  },
  {
    name: 'obi_short_threshold',
    label: 'Short OBI Threshold',
    type: 'float',
    min: 0,
    max: 1,
    step: 0.01,
    defaultValue: 0.42,
    description: 'Maximum order book imbalance ratio permitted when entering short positions.'
  },
  {
    name: 'fake_breakout_max',
    label: 'Fake Breakout Limit',
    type: 'float',
    allow_null: true,
    min: 0,
    max: 1,
    step: 0.01,
    defaultValue: 0.6,
    description: 'Upper bound for the fake breakout probability metric; null disables the filter.'
  },
  {
    name: 'momentum_tick_threshold',
    label: 'Momentum Threshold (ticks)',
    type: 'float',
    min: 0,
    max: 5,
    defaultValue: 0.25,
    description: 'Required mid-price change (in ticks) since the previous snapshot.'
  }
];

const RUNTIME_LOG_LEVEL_CLASS: Record<RuntimeLogTone, string> = {
  info: styles.runtimeLogLevelInfo,
  warning: styles.runtimeLogLevelWarning,
  error: styles.runtimeLogLevelError,
  success: styles.runtimeLogLevelSuccess,
  debug: styles.runtimeLogLevelDebug,
  neutral: styles.runtimeLogLevelInfo
};

interface RiskLogDetailEntry {
  key: string;
  value: string;
}

interface RiskLogCheckView {
  id: string;
  label: string;
  status: StrategyRiskLogCheckStatus;
  reason: string | null;
  currentValue: string | null;
  threshold: string | null;
}

type RiskLogView = {
  timestamp: string | null;
  level: RuntimeLogTone;
  status: string | null;
  action: string | null;
  summary: string | null;
  message: string | null;
  checks: RiskLogCheckView[];
  details: RiskLogDetailEntry[];
};

const SKIPPED_RISK_DETAIL_KEYS = new Set(['event', 'payload', 'extra']);

const isRenderableRiskDetailValue = (value: unknown): boolean => {
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
    return value.length > 0;
  }
  if (value instanceof Date) {
    return !Number.isNaN(value.getTime());
  }
  if (typeof value === 'object') {
    return Object.keys(value as Record<string, unknown>).length > 0;
  }
  return true;
};

const formatRiskDetailValue = (value: unknown): string => {
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (value === null || value === undefined) {
    return '—';
  }
  try {
    return JSON.stringify(value);
  } catch (_error) {
    return String(value);
  }
};

const RISK_CHECK_STATUS_LABEL: Record<StrategyRiskLogCheckStatus, string> = {
  pass: '通过',
  fail: '失败',
  warning: '警告',
  info: '信息',
  unknown: '未知'
};

const RISK_CHECK_STATUS_ICON: Record<StrategyRiskLogCheckStatus, string> = {
  pass: '✓',
  fail: '✕',
  warning: '⚠',
  info: 'ℹ',
  unknown: '？'
};

const RISK_CHECK_STATUS_CLASS: Record<StrategyRiskLogCheckStatus, string> = {
  pass: styles.riskCheckStatusPass,
  fail: styles.riskCheckStatusFail,
  warning: styles.riskCheckStatusWarning,
  info: styles.riskCheckStatusInfo,
  unknown: styles.riskCheckStatusUnknown
};

const getRiskLogSummaryToneClass = (status: string | null | undefined): string => {
  if (typeof status !== 'string') {
    return styles.riskLogSummaryNeutral;
  }
  const normalized = status.trim().toLowerCase();
  if (normalized === 'permitted') {
    return styles.riskLogSummaryPermitted;
  }
  if (normalized === 'blocked') {
    return styles.riskLogSummaryBlocked;
  }
  return styles.riskLogSummaryNeutral;
};

interface RiskLogListProps {
  logs: RiskLogView[];
  status: RequestStatus;
  error?: string;
  onRefresh: () => void;
  disabled?: boolean;
}

const RiskLogList = ({ logs, status, error, onRefresh, disabled }: RiskLogListProps) => {
  const [expandedLogs, setExpandedLogs] = useState<Set<string>>(() => new Set());

  const toggleLogDetails = useCallback((logKey: string) => {
    setExpandedLogs((previous) => {
      const next = new Set(previous);
      if (next.has(logKey)) {
        next.delete(logKey);
      } else {
        next.add(logKey);
      }
      return next;
    });
  }, []);

  return (
    <div className={styles.riskLogsPanel}>
      <div className={styles.riskLogsHeader}>
        <h4>Risk Logs</h4>
        <div className={styles.riskLogsControls}>
          <button
            type="button"
            className={clsx(styles.formButton, styles.formButtonSecondary)}
            onClick={onRefresh}
            disabled={status === 'loading' || disabled}
          >
            Refresh
          </button>
        </div>
      </div>
      {status === 'loading' ? (
        <div className={styles.statusMessage}>风险日志加载中...</div>
      ) : null}
      {error ? (
        <div className={clsx(styles.statusMessage, styles.statusError)}>
          加载风险日志失败：{error}
        </div>
      ) : null}
      {logs.length ? (
        <ul className={styles.runtimeLogList}>
          {logs.map((log, index) => {
            const logKey = `risk-log-${index}`;
            const levelClass =
              RUNTIME_LOG_LEVEL_CLASS[log.level] ?? styles.runtimeLogLevelInfo;
            const summaryToneClass = getRiskLogSummaryToneClass(log.status);
            const isExpanded = expandedLogs.has(logKey);
            return (
              <li className={styles.runtimeLogItem} key={logKey}>
                <div className={styles.runtimeLogHeader}>
                  <span className={clsx(styles.runtimeLogLevel, levelClass)}>
                    {log.level}
                  </span>
                  {log.action ? (
                    <span className={styles.runtimeLogAction}>{log.action}</span>
                  ) : null}
                  {log.status ? (
                    <span className={styles.runtimeLogStatus}>{log.status}</span>
                  ) : null}
                  {log.timestamp ? (
                    <span className={styles.runtimeLogTimestamp}>
                      {log.timestamp}
                    </span>
                  ) : null}
                </div>
                <div className={clsx(styles.runtimeLogMessage, summaryToneClass)}>
                  {log.summary ?? log.message ?? '—'}
                </div>
                {log.summary && log.message && log.summary !== log.message ? (
                  <div className={styles.riskLogSecondaryMessage}>{log.message}</div>
                ) : null}
                {log.checks.length ? (
                  <ul className={styles.riskCheckList}>
                    {log.checks.map((check) => {
                      const statusClass =
                        RISK_CHECK_STATUS_CLASS[check.status] ?? styles.riskCheckStatusUnknown;
                      const statusIcon =
                        RISK_CHECK_STATUS_ICON[check.status] ?? RISK_CHECK_STATUS_ICON.unknown;
                      const statusLabel = RISK_CHECK_STATUS_LABEL[check.status];
                      return (
                        <li key={`${logKey}-${check.id}`} className={styles.riskCheckItem}>
                          <div className={styles.riskCheckHeader}>
                            <span className={clsx(styles.riskCheckStatus, statusClass)}>
                              <span className={styles.riskCheckStatusIcon} aria-hidden="true">
                                {statusIcon}
                              </span>
                              {statusLabel}
                            </span>
                            <span className={styles.riskCheckLabel}>{check.label}</span>
                          </div>
                          <p className={styles.riskCheckReason}>{check.reason ?? '暂无说明'}</p>
                          <dl className={styles.riskCheckMetrics}>
                            <div className={styles.riskCheckMetric}>
                              <dt className={styles.riskCheckMetricLabel}>当前值</dt>
                              <dd className={styles.riskCheckMetricValue}>{check.currentValue ?? '—'}</dd>
                            </div>
                            <div className={styles.riskCheckMetric}>
                              <dt className={styles.riskCheckMetricLabel}>阈值</dt>
                              <dd className={styles.riskCheckMetricValue}>{check.threshold ?? '—'}</dd>
                            </div>
                          </dl>
                        </li>
                      );
                    })}
                  </ul>
                ) : null}
                {log.details.length ? (
                  <div className={styles.runtimeLogDetailToggle}>
                    <button
                      type="button"
                      className={styles.runtimeLogDetailToggleButton}
                      onClick={() => toggleLogDetails(logKey)}
                      aria-expanded={isExpanded}
                    >
                      {isExpanded ? 'Hide details' : 'Show details'}
                    </button>
                    {isExpanded ? (
                      <dl className={styles.runtimeLogDetails}>
                        {log.details.map((detail, detailIndex) => (
                          <div
                            key={`${logKey}-detail-${detailIndex}`}
                            className={styles.runtimeLogDetail}
                          >
                            <dt className={styles.runtimeLogDetailKey}>{detail.key}</dt>
                            <dd className={styles.runtimeLogDetailValue}>
                              {formatRuntimeLogDetailValue(detail.key, detail.value)}
                            </dd>
                          </div>
                        ))}
                      </dl>
                    ) : null}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : (
        <div className={styles.formHint}>暂无风险日志</div>
      )}
    </div>
  );
};

const BROKEN_SUBSCRIPTION_CAUSE_CODES = new Set([
  'subscription_lost',
  'subscription_dropped',
  'subscription_missing',
  'subscription_inactive',
  'subscription_error',
  'subscription_failed',
  'subscription_broken'
]);

const normalizeDescriptor = (value: string | null | undefined): string =>
  typeof value === 'string' ? value.trim().toLowerCase() : '';

const PRICE_DETAIL_KEYWORDS = [
  'price',
  'close',
  'open',
  'high',
  'low',
  'level',
  'threshold',
  'entry',
  'exit',
  'stop',
  'take',
  'target',
  'limit',
  'range',
  'ema'
];

const normalizeDetailKey = (value: string): string =>
  value.replace(/[^a-z0-9]+/gi, '').toLowerCase();

const formatRuntimeLogDetailValue = (key: string, raw: string): string => {
  const normalizedKey = normalizeDetailKey(key);
  const shouldFormat = PRICE_DETAIL_KEYWORDS.some((token) => normalizedKey.includes(token));
  if (!shouldFormat) {
    return raw;
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    return raw;
  }
  return parsed.toFixed(3);
};

const isBrokenSubscriptionCause = (causeCode: string | null, cause: string | null): boolean => {
  const normalizedCode = normalizeDescriptor(causeCode);
  if (normalizedCode) {
    if (BROKEN_SUBSCRIPTION_CAUSE_CODES.has(normalizedCode)) {
      return true;
    }
    if (normalizedCode.includes('subscription')) {
      const hasFailureKeyword = ['lost', 'drop', 'error', 'fail', 'broken', 'inactive', 'missing'].some((keyword) =>
        normalizedCode.includes(keyword)
      );
      if (hasFailureKeyword) {
        return true;
      }
    }
  }

  const normalizedCause = normalizeDescriptor(cause);
  if (normalizedCause) {
    if (
      (normalizedCause.includes('订阅') &&
        (normalizedCause.includes('失') ||
          normalizedCause.includes('断') ||
          normalizedCause.includes('中断') ||
          normalizedCause.includes('掉线') ||
          normalizedCause.includes('异常'))) ||
      (normalizedCause.includes('subscription') &&
        ['lost', 'drop', 'error', 'fail', 'broken', 'inactive', 'missing'].some((keyword) =>
          normalizedCause.includes(keyword)
        ))
    ) {
      return true;
    }
  }

  return false;
};

const formatNumber = (value: MetricValue, fractionDigits = 2): string => {
  if (value === null || value === undefined) {
    return '—';
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      return value.toString();
    }
    return new Intl.NumberFormat('en-US', {
      maximumFractionDigits: fractionDigits,
      minimumFractionDigits: 0
    }).format(value);
  }
  const parsed = Number(value);
  if (Number.isFinite(parsed)) {
    return formatNumber(parsed, fractionDigits);
  }
  return String(value);
};

const formatCurrency = (value: MetricValue): string => {
  if (value === null || value === undefined) {
    return '$0.00';
  }
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return formatCurrency(parsed);
    }
    return value;
  }
  if (!Number.isFinite(value)) {
    return value.toString();
  }
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value);
};

const formatPercent = (value: MetricValue): string => {
  if (value === null || value === undefined) {
    return '0%';
  }
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return formatPercent(parsed);
    }
    return value;
  }
  return `${(value * 100).toFixed(2)}%`;
};

const formatDuration = (value: MetricValue): string => {
  if (value === null || value === undefined) {
    return '—';
  }
  const parsed = typeof value === 'string' ? Number(value) : value;
  if (!Number.isFinite(parsed)) {
    return String(value);
  }
  if (parsed <= 0) {
    return '0 秒';
  }
  const hours = Math.floor(parsed / 3600);
  const minutes = Math.floor((parsed % 3600) / 60);
  const seconds = Math.floor(parsed % 60);
  const parts: string[] = [];
  if (hours) {
    parts.push(`${hours} 小时`);
  }
  if (minutes) {
    parts.push(`${minutes} 分钟`);
  }
  if (seconds || !parts.length) {
    parts.push(`${seconds} 秒`);
  }
  return parts.join(' ');
};

const optionValueToString = (value: string | number | boolean): string => {
  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }
  return String(value);
};

const MAPPING_TYPE_KEYWORDS = ['dict', 'mapping', 'map', 'object', 'json'];
const LIST_TYPE_KEYWORDS = ['list', 'tuple', 'array', 'sequence'];

const parameterTypeIndicatesMapping = (rawType: string): boolean => {
  if (!rawType.trim()) {
    return false;
  }
  const normalized = rawType.trim().toLowerCase();
  return MAPPING_TYPE_KEYWORDS.some((keyword) => normalized.includes(keyword));
};

const parameterTypeIndicatesList = (rawType: string): boolean => {
  if (!rawType.trim()) {
    return false;
  }
  const normalized = rawType.trim().toLowerCase();
  return LIST_TYPE_KEYWORDS.some((keyword) => normalized.includes(keyword));
};

const normalizeParameterType = (definition: StrategyParameterConfig): string => {
  const explicit = definition.type;
  if (typeof explicit === 'string' && explicit.trim()) {
    const normalizedExplicit = explicit.trim().toLowerCase();
    if (parameterTypeIndicatesMapping(normalizedExplicit)) {
      return 'mapping';
    }
    if (parameterTypeIndicatesList(normalizedExplicit)) {
      return 'list';
    }
    return normalizedExplicit;
  }
  const candidate = definition.value ?? definition.defaultValue ?? null;
  if (typeof candidate === 'number') {
    return Number.isInteger(candidate) ? 'integer' : 'float';
  }
  if (typeof candidate === 'boolean') {
    return 'boolean';
  }
  if (Array.isArray(candidate)) {
    return 'list';
  }
  if (candidate && typeof candidate === 'object') {
    return 'mapping';
  }
  return 'string';
};

const toParameterInputString = (value: unknown): string => {
  if (value === null || value === undefined) {
    return '';
  }
  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      return '';
    }
    return String(value);
  }
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch (_error) {
      return '';
    }
  }
  return String(value);
};

const formatParameterValueDisplay = (value: unknown): string => {
  if (value === null || value === undefined) {
    return '—';
  }
  if (typeof value === 'boolean') {
    return value ? 'True' : 'False';
  }
  if (typeof value === 'number') {
    return Number.isInteger(value) ? formatNumber(value, 0) : formatNumber(value, 4);
  }
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch (_error) {
      return '—';
    }
  }
  return String(value);
};

const formatParameterRange = (definition: StrategyParameterConfig): string => {
  const parts: string[] = [];
  const { min, max, step } = definition;
  const hasMin = typeof min === 'number' && Number.isFinite(min);
  const hasMax = typeof max === 'number' && Number.isFinite(max);
  const formatBound = (value: number) =>
    Number.isInteger(value) ? formatNumber(value, 0) : formatNumber(value, 4);

  if (hasMin && hasMax) {
    parts.push(`${formatBound(min!)} – ${formatBound(max!)}`);
  } else if (hasMin) {
    parts.push(`≥ ${formatBound(min!)}`);
  } else if (hasMax) {
    parts.push(`≤ ${formatBound(max!)}`);
  }

  if (typeof step === 'number' && Number.isFinite(step) && step > 0) {
    const stepLabel = Number.isInteger(step) ? formatNumber(step, 0) : formatNumber(step, 4);
    parts.push(`步长 ${stepLabel}`);
  }

  return parts.length ? parts.join(' · ') : '—';
};

const parseParameterInputValue = (
  definition: StrategyParameterConfig,
  rawValue: string
): unknown => {
  const trimmed = rawValue.trim();
  if (!trimmed) {
    return null;
  }

  if (definition.options && definition.options.length) {
    const matched = definition.options.find(
      (option) => optionValueToString(option.value) === trimmed
    );
    if (matched) {
      return matched.value;
    }
    throw new Error('请选择列表中的有效值');
  }

  const normalizedType = normalizeParameterType(definition);
  if (parameterTypeIndicatesMapping(normalizedType)) {
    try {
      const parsed = JSON.parse(trimmed);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('请输入有效的 JSON 对象');
      }
      return parsed;
    } catch (_error) {
      throw new Error('请输入有效的 JSON 对象');
    }
  }
  if (parameterTypeIndicatesList(normalizedType)) {
    if (trimmed.startsWith('[')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (!Array.isArray(parsed)) {
          throw new Error('请输入有效的列表');
        }
        return parsed;
      } catch (_error) {
        throw new Error('请输入有效的列表');
      }
    }
    const tokens = trimmed
      .split(',')
      .map((token) => token.trim())
      .filter((token) => token.length > 0);
    return tokens;
  }
  if (normalizedType.includes('bool')) {
    const lowered = trimmed.toLowerCase();
    if (['true', '1', 'yes', 'y', 'on'].includes(lowered)) {
      return true;
    }
    if (['false', '0', 'no', 'n', 'off'].includes(lowered)) {
      return false;
    }
    throw new Error('请输入布尔值（true/false）');
  }

  if (normalizedType.includes('int')) {
    const parsed = Number.parseInt(trimmed, 10);
    if (Number.isNaN(parsed)) {
      throw new Error('请输入有效的整数');
    }
    return parsed;
  }

  if (
    normalizedType.includes('float') ||
    normalizedType.includes('decimal') ||
    normalizedType.includes('number')
  ) {
    const parsed = Number.parseFloat(trimmed);
    if (!Number.isFinite(parsed)) {
      throw new Error('请输入有效的数字');
    }
    return parsed;
  }

  return trimmed;
};

const parameterValuesAreEqual = (left: unknown, right: unknown): boolean => {
  if (typeof left === 'number' && typeof right === 'number') {
    if (!Number.isFinite(left) || !Number.isFinite(right)) {
      return Object.is(left, right);
    }
    return Math.abs(left - right) < 1e-9;
  }
  return Object.is(left, right);
};

const resolveMetricValue = (
  summary: Record<string, number | string | null>,
  keys: string[]
): MetricValue => {
  for (const key of keys) {
    if (key in summary) {
      return summary[key];
    }
  }
  return null;
};

const parseFiniteNumber = (value: unknown): number | null => {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }
    const normalized = trimmed.replace(/,/g, '');
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const normalizeTradeSide = (value: unknown): 'BUY' | 'SELL' | null => {
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (!normalized) {
      return null;
    }
    if (
      normalized === 'buy' ||
      normalized === 'b' ||
      normalized === 'long' ||
      normalized === 'bull' ||
      normalized === 'bullish' ||
      normalized === 'open_long'
    ) {
      return 'BUY';
    }
    if (
      normalized === 'sell' ||
      normalized === 's' ||
      normalized === 'short' ||
      normalized === 'bear' ||
      normalized === 'bearish' ||
      normalized === 'open_short'
    ) {
      return 'SELL';
    }
    if (normalized.includes('long')) {
      return 'BUY';
    }
    if (normalized.includes('short')) {
      return 'SELL';
    }
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    if (value > 0) {
      return 'BUY';
    }
    if (value < 0) {
      return 'SELL';
    }
  }
  return null;
};

const parseDataSourceValue = (value: string | null | undefined): string => {
  if (!value) {
    return '';
  }
  const [rawSource] = value.split(':', 2);
  return rawSource?.trim() ?? '';
};

const SparklineChart = ({
  data,
  color = '#2f80ed',
  height = 120
}: {
  data: StrategyPerformancePoint[];
  color?: string;
  height?: number;
}) => {
  if (!data.length) {
    return <div className={styles.chartPlaceholder}>暂无数据</div>;
  }
  const path = buildSparklinePath(data);
  return (
    <svg className={styles.chartCanvas} viewBox="0 0 100 100" preserveAspectRatio="none" style={{ height }}>
      <path d={path} fill="none" stroke={color} strokeWidth={1.5} />
    </svg>
  );
};

const DistributionChart = ({
  data,
  positiveColor = '#27ae60',
  negativeColor = '#eb5757'
}: {
  data: StrategyDistributionPoint[];
  positiveColor?: string;
  negativeColor?: string;
}) => {
  const bins = useMemo(() => buildDistributionBins(data), [data]);

  if (!bins.length) {
    return <div className={styles.chartPlaceholder}>暂无数据</div>;
  }
  const maxValue = Math.max(...bins.map((entry) => entry.count || 0), 1);
  return (
    <div className={styles.barChart}>
      {bins.map((entry, index) => {
        const heightPercent = entry.count <= 0 ? 0 : Math.max(6, (entry.count / maxValue) * 100);
        const color = entry.midpoint >= 0 ? positiveColor : negativeColor;
        return (
          <div key={`${entry.label}-${index}`} className={styles.barChartColumn}>
            <div
              className={styles.barChartBar}
              style={{ height: `${heightPercent}%`, backgroundColor: color }}
            />
            <div className={styles.barChartLabel}>{entry.label}</div>
          </div>
        );
      })}
    </div>
  );
};

const WinLossSummary = ({ data }: { data: StrategyDistributionPoint[] }) => {
  const wins = data.find((entry) => entry.bucket.toLowerCase().includes('win') || entry.bucket === 'win');
  const losses = data.find((entry) => entry.bucket.toLowerCase().includes('loss') || entry.bucket === 'loss');
  const total = (wins?.value ?? 0) + (losses?.value ?? 0);
  const winRate = total > 0 ? ((wins?.value ?? 0) / total) * 100 : 0;
  return (
    <div className={styles.winLossSummary}>
      <div>
        <span className={styles.winIndicator}>胜</span>
        <strong>{wins?.value ?? 0}</strong>
      </div>
      <div>
        <span className={styles.lossIndicator}>负</span>
        <strong>{losses?.value ?? 0}</strong>
      </div>
      <div className={styles.winRate}>胜率 {winRate.toFixed(1)}%</div>
    </div>
  );
};

  
const deriveReferenceDate = (
  period: string,
  calendar: StrategyPnLCalendar | null,
  timezone: string | null
): Date => {
  const nowParts = getZonedDateParts(new Date(), timezone);
  const fallback = buildZonedDate({ year: nowParts.year, month: nowParts.month - 1, date: 1 }, timezone);
  if (!calendar) {
    return fallback;
  }

  if (period === 'all') {
    if (calendar.start) {
      const startDate = new Date(calendar.start);
      if (!Number.isNaN(startDate.getTime())) {
        const parts = getZonedDateParts(startDate, timezone);
        return buildZonedDate({ year: parts.year, month: parts.month - 1, date: 1 }, timezone);
      }
    }
    if (calendar.months?.length) {
      const first = calendar.months[0];
      const [firstYearRaw, firstMonthRaw] = first.month.split('-');
      const firstYear = Number(firstYearRaw);
      const firstMonthIndex = Number(firstMonthRaw) - 1;
      if (Number.isFinite(firstYear) && Number.isFinite(firstMonthIndex)) {
        return buildZonedDate({ year: firstYear, month: firstMonthIndex, date: 1 }, timezone);
      }
    }
  }

  if (calendar.end) {
    const endDate = new Date(calendar.end);
    if (!Number.isNaN(endDate.getTime())) {
      const parts = getZonedDateParts(endDate, timezone);
      return buildZonedDate({ year: parts.year, month: parts.month - 1, date: 1 }, timezone);
    }
  }

  if (calendar.months?.length) {
    const last = calendar.months[calendar.months.length - 1];
    const [lastYearRaw, lastMonthRaw] = last.month.split('-');
    const lastYear = Number(lastYearRaw);
    const lastMonthIndex = Number(lastMonthRaw) - 1;
    if (Number.isFinite(lastYear) && Number.isFinite(lastMonthIndex)) {
      return buildZonedDate({ year: lastYear, month: lastMonthIndex, date: 1 }, timezone);
    }
  }

  return fallback;
};

const CalendarView = ({
  calendar,
  selectedPeriod,
  timezone
}: {
  calendar: StrategyPnLCalendar | null;
  selectedPeriod: string;
  timezone: string | null;
}) => {
  const target = useMemo(() => {
    const reference = deriveReferenceDate(selectedPeriod, calendar, timezone);
    const safeReference = Number.isNaN(reference.getTime()) ? new Date() : reference;
    const referenceParts = getZonedDateParts(safeReference, timezone);
    const year = referenceParts.year;
    const monthIndex = referenceParts.month - 1;
    const monthKey = `${year}-${String(monthIndex + 1).padStart(2, '0')}`;
    const monthEntry = calendar?.months?.find((item) => item.month === monthKey) ?? null;
    return {
      label: `${year}年${String(monthIndex + 1).padStart(2, '0')}月`,
      year,
      monthIndex,
      days: monthEntry?.days ?? []
    };
  }, [calendar, selectedPeriod, timezone]);

  const cells = useMemo(
    () =>
      buildMonthCells({
        year: target.year,
        month: target.monthIndex + 1,
        days: target.days,
        timezone
      }),
    [target.days, target.monthIndex, target.year, timezone]
  );

  if (!calendar) {
    return <div className={styles.calendarPlaceholder}>暂无日历数据。</div>;
  }

  return (
    <div className={styles.calendarGrid}>
      <div className={styles.calendarMonth}>
        <div className={styles.calendarMonthHeader}>{target.label}</div>
        <div className={styles.calendarWeekdays}>
          {['日', '一', '二', '三', '四', '五', '六'].map((day) => (
            <span key={day}>{day}</span>
          ))}
        </div>
        <div className={styles.calendarDays}>
          {cells.map((cell, index) => {
            if (cell.type === 'empty') {
              return <span key={`empty-${index}`} className={styles.calendarDayEmpty} />;
            }
            const positive = (cell.pnl ?? 0) > 0;
            const negative = (cell.pnl ?? 0) < 0;
            return (
              <span
                key={`day-${target.year}-${target.monthIndex + 1}-${cell.day}`}
                className={clsx(
                  styles.calendarDay,
                  positive && styles.calendarDayPositive,
                  negative && styles.calendarDayNegative
                )}
              >
                <strong>{cell.day}</strong>
                <em>{cell.pnl === null ? '—' : cell.pnl.toFixed(0)}</em>
              </span>
            );
          })}
        </div>
      </div>
    </div>
  );
};

const parseNumericInput = (value: string): number | null => {
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

const formatConIdDisplay = (value: number | string | null | undefined): string => {
  if (value === null || value === undefined) {
    return '';
  }
  return String(value);
};

const useDomRuntimeMetrics = (
  runtime: StrategyRuntimeDetail | null
): DomRuntimeMetricsViewModel[] => useMemo(() => buildDomRuntimeMetrics(runtime), [runtime]);

const useKlineRuntimeMetrics = (
  runtime: StrategyRuntimeDetail | null,
  normalizedTemplate: string
): KlineRuntimeMetricsViewModel =>
  useMemo(() => buildKlineRuntimeMetrics(runtime, normalizedTemplate), [runtime, normalizedTemplate]);

function StrategyDetailPanel({
  strategy,
  metrics,
  performance: performanceProp,
  fallbackMode,
  initialTab = 'summary',
  selectedPeriod: selectedPeriodProp,
  onSelectedPeriodChange,
  headerExpanded: headerExpandedProp,
  active = true
}: StrategyDetailPanelProps) {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const strategyKey = strategy?.id !== undefined && strategy?.id !== null ? String(strategy.id) : null;
  const [activeTab, setActiveTab] = useState<DetailTab>(initialTab);
  const [selectedPeriodState, setSelectedPeriodState] = useState<string>('day');
  const [candlesInterval, setCandlesInterval] = useState<string>('5m');
  const [resubscribePending, setResubscribePending] = useState<boolean>(false);
  const [resubscribeConId, setResubscribeConId] = useState<string>('');
  const [resubscribeConIdDirty, setResubscribeConIdDirty] = useState<boolean>(false);
  const [ordersPage, setOrdersPage] = useState<number>(1);
  const lastLoadedOrdersPageRef = useRef<number | null>(null);
  const resubscribeStrategyIdRef = useRef<string | null>(null);
  const [loadedRisk, setLoadedRisk] = useState<boolean>(false);
  const [loadedRuntime, setLoadedRuntime] = useState<boolean>(false);
  const [loadedSections, setLoadedSections] = useState<
    Partial<Record<StrategyPerformanceSection, boolean>>
  >({});
  const [sectionLoading, setSectionLoading] = useState<
    Partial<Record<StrategyPerformanceSection, boolean>>
  >({});
  const [sectionErrors, setSectionErrors] = useState<
    Partial<Record<StrategyPerformanceSection, string | null>>
  >({});
  const subscriptionResyncStatus = useAppSelector((state) =>
    strategyKey ? state.strategies.subscriptionResyncStatus[strategyKey] ?? 'idle' : 'idle'
  );
  const subscriptionResyncError = useAppSelector((state) =>
    strategyKey ? state.strategies.subscriptionResyncError[strategyKey] : undefined
  );
  const summaryLoading = Boolean(sectionLoading.summary);
  const ordersSectionLoading = Boolean(sectionLoading.orders);
  const chartsLoading = Boolean(sectionLoading.charts);
  const calendarLoading = Boolean(sectionLoading.calendar);
  const ordersSectionError = sectionErrors.orders ?? null;

  const selectedPeriod = selectedPeriodProp ?? selectedPeriodState;
  const setSelectedPeriod = onSelectedPeriodChange ?? setSelectedPeriodState;
  const headerExpanded = headerExpandedProp ?? false;
  const performanceFromStore = useAppSelector((state) =>
    strategy?.id ? state.strategies.performance[strategy.id]?.[selectedPeriod] ?? null : null
  );
  const performance = performanceFromStore ?? performanceProp;

  const detail: StrategyDetailSummary | null = useAppSelector((state) =>
    strategy?.id ? state.strategies.details[strategy.id] ?? null : null
  );
  const detailStatus = useAppSelector((state) =>
    strategy?.id ? state.strategies.detailStatus[strategy.id] ?? 'idle' : 'idle'
  );
  const detailError = useAppSelector((state) =>
    strategy?.id ? state.strategies.detailError[strategy.id] : undefined
  );
  const runtimeDetail: StrategyRuntimeDetail | null = useAppSelector((state) =>
    strategyKey ? state.strategies.runtime[strategyKey] ?? null : null
  );
  const runtimeStatus = useAppSelector((state) =>
    strategyKey ? state.strategies.runtimeStatus[strategyKey] ?? 'idle' : 'idle'
  );
  const runtimeError = useAppSelector((state) =>
    strategyKey ? state.strategies.runtimeError[strategyKey] : undefined
  );
  const authToken = useAppSelector((state) => state.auth?.token ?? null);
  const clientId = useAppSelector((state) => state.realtime.clientId ?? null);
  const riskSettings: StrategyRiskSettings | null = useAppSelector((state) =>
    strategy?.id ? state.strategies.risk[strategy.id] ?? null : null
  );
  const riskStatus = useAppSelector((state) =>
    strategy?.id ? state.strategies.riskStatus[strategy.id] ?? 'idle' : 'idle'
  );
  const riskError = useAppSelector((state) =>
    strategy?.id ? state.strategies.riskError[strategy.id] : undefined
  );
  const riskLogs: StrategyRiskLogEntry[] | null = useAppSelector((state) =>
    strategy?.id ? state.strategies.riskLogs[strategy.id] ?? null : null
  );
  const riskLogsStatus = useAppSelector((state) =>
    strategy?.id ? state.strategies.riskLogsStatus[strategy.id] ?? 'idle' : 'idle'
  );
  const riskLogsError = useAppSelector((state) =>
    strategy?.id ? state.strategies.riskLogsError[strategy.id] : undefined
  );
  const summaryStatus = useAppSelector((state) =>
    strategy?.id ? state.strategies.summaryStatus[strategy.id] ?? 'idle' : 'idle'
  );
  const summaryError = useAppSelector((state) =>
    strategy?.id ? state.strategies.summaryError[strategy.id] : undefined
  );
  const parameterStatus = useAppSelector((state) =>
    strategy?.id ? state.strategies.parameterStatus[strategy.id] ?? 'idle' : 'idle'
  );
  const parameterError = useAppSelector((state) =>
    strategy?.id ? state.strategies.parameterError[strategy.id] : undefined
  );
  const riskSaveStatus = useAppSelector((state) =>
    strategy?.id ? state.strategies.riskSaveStatus[strategy.id] ?? 'idle' : 'idle'
  );
  const riskSaveError = useAppSelector((state) =>
    strategy?.id ? state.strategies.riskSaveError[strategy.id] : undefined
  );

  const memoizedRiskLogs: RiskLogView[] = useMemo(
    () =>
      (riskLogs ?? []).map((entry) => {
        const details = entry.context
          ? Object.entries(entry.context)
              .filter(
                ([key, value]) =>
                  !SKIPPED_RISK_DETAIL_KEYS.has(key) && isRenderableRiskDetailValue(value)
              )
              .map(([key, value]) => ({
                key,
                value: formatRiskDetailValue(value)
              }))
          : [];
        const checks = Array.isArray(entry.checks)
          ? entry.checks.map((check, index) => ({
              id: check.id || `risk-check-${index}`,
              label: check.label || `检查 ${index + 1}`,
              status: (check.status ?? 'unknown') as StrategyRiskLogCheckStatus,
              reason: check.reason ?? null,
              currentValue: check.currentValue ?? null,
              threshold: check.threshold ?? null
            }))
          : [];
        return {
          timestamp: formatTimestamp(entry.timestamp),
          level: entry.level as RuntimeLogTone,
          status: entry.status ?? null,
          action: entry.action ?? null,
          summary: entry.summary ?? null,
          message: entry.message ?? null,
          checks,
          details
        };
      }),
    [riskLogs]
  );

  const riskLogsRequestingRef = useRef<boolean>(false);

  const refreshRiskLogs = useCallback(() => {
    if (!strategy?.id) {
      return;
    }
    if (riskLogsRequestingRef.current) {
      return;
    }
    riskLogsRequestingRef.current = true;
    void dispatch(
      loadStrategyRiskLogs({ strategyId: strategy.id, page: 1, limit: 50 })
    ).finally(() => {
      riskLogsRequestingRef.current = false;
    });
  }, [dispatch, strategy?.id]);

  useEffect(() => {
    if (!active || activeTab !== 'risk' || !strategy?.id) {
      return;
    }
    const shouldFetch =
      riskLogsStatus === 'idle' || riskLogsStatus === 'failed' || !riskLogs;
    if (shouldFetch) {
      refreshRiskLogs();
    }
  }, [active, activeTab, refreshRiskLogs, strategy?.id, riskLogsStatus, riskLogs]);
  const candlesSnapshot: StrategyCandlesSnapshot | null = useAppSelector((state) =>
    strategy?.id ? state.strategies.candles[strategy.id] ?? null : null
  );
  const candlesStatus = useAppSelector((state) =>
    strategy?.id ? state.strategies.candlesStatus[strategy.id] ?? 'idle' : 'idle'
  );
  const candlesError = useAppSelector((state) =>
    strategy?.id ? state.strategies.candlesError[strategy.id] : undefined
  );
  const candlesRequestState = useAppSelector((state) =>
    strategy?.id ? state.strategies.candlesRequest[strategy.id] : undefined
  );

  const candlestickBars = useMemo<MarketBar[]>(() => {
    if (!candlesSnapshot?.candles?.length) {
      return [];
    }
    return candlesSnapshot.candles.map((candle) => ({
      timestamp: candle.timestamp,
      open: candle.open,
      high: candle.high,
      low: candle.low,
      close: candle.close,
      volume: candle.volume
    }));
  }, [candlesSnapshot]);

  const candlesIntervalSeconds =
    candlesSnapshot?.intervalSeconds ?? candlesRequestState?.intervalSeconds ?? null;
  const candlesSymbol = candlesSnapshot?.symbol ?? detail?.primarySymbol ?? strategy?.symbol ?? null;
  const candlesRefreshedAt = useMemo(() => {
    if (!candlesSnapshot?.refreshedAt) {
      return null;
    }
    return formatTimestamp(candlesSnapshot.refreshedAt);
  }, [candlesSnapshot?.refreshedAt]);
  const resolvedCandlesInterval = candlesSnapshot?.interval ?? candlesInterval;

  const candleTimeBounds = useMemo(() => {
    if (!candlestickBars.length) {
      return null;
    }
    const timestamps = candlestickBars
      .map((bar) => new Date(bar.timestamp).getTime())
      .filter((value) => Number.isFinite(value));

    if (!timestamps.length) {
      return null;
    }

    const sortedTimestamps = [...timestamps].sort((a, b) => a - b);
    const resolvedIntervalMs = (() => {
      if (candlesIntervalSeconds && Number.isFinite(candlesIntervalSeconds)) {
        return candlesIntervalSeconds * 1000;
      }

      const intervalCounts = new Map<number, number>();
      for (let index = 1; index < sortedTimestamps.length; index += 1) {
        const diff = sortedTimestamps[index] - sortedTimestamps[index - 1];
        if (!Number.isFinite(diff) || diff <= 0) {
          continue;
        }
        intervalCounts.set(diff, (intervalCounts.get(diff) ?? 0) + 1);
      }

      let mostFrequentDiff: number | null = null;
      let highestCount = 0;
      intervalCounts.forEach((count, diff) => {
        if (count > highestCount) {
          highestCount = count;
          mostFrequentDiff = diff;
        }
      });

      return mostFrequentDiff;
    })();

    const start = sortedTimestamps[0];
    const end = sortedTimestamps[sortedTimestamps.length - 1] + (resolvedIntervalMs ?? 0);

    return { start, end };
  }, [candlesIntervalSeconds, candlestickBars]);

  useEffect(() => {
    if (!strategy?.id) {
      setCandlesInterval('5m');
      return;
    }
    const resolvedInterval = candlesRequestState?.interval ?? candlesSnapshot?.interval ?? null;
    if (resolvedInterval && resolvedInterval !== candlesInterval) {
      setCandlesInterval(resolvedInterval);
    }
  }, [
    strategy?.id,
    candlesRequestState?.interval,
    candlesSnapshot?.interval,
    candlesInterval
  ]);

  const [summarySymbol, setSummarySymbol] = useState<string>('');
  const [isEditingSymbol, setIsEditingSymbol] = useState<boolean>(false);
  const [isEditingScheduleTimezone, setIsEditingScheduleTimezone] = useState<boolean>(false);
  const [scheduleTimezoneDraft, setScheduleTimezoneDraft] = useState<string>('');

  const [riskMaxPosition, setRiskMaxPosition] = useState<string>('');
  const [riskLossThreshold, setRiskLossThreshold] = useState<string>('');
  const [riskLossDuration, setRiskLossDuration] = useState<string>('');
  const [riskForbidPyramiding, setRiskForbidPyramiding] = useState<boolean>(false);
  const [riskNotifyOnBreach, setRiskNotifyOnBreach] = useState<boolean>(true);
  const [editingParameter, setEditingParameter] = useState<string | null>(null);
  const [editingDraftValue, setEditingDraftValue] = useState<string>('');
  const [parameterInlineError, setParameterInlineError] = useState<string | null>(null);
  const [pendingParameter, setPendingParameter] = useState<string | null>(null);
  const [parameterBanner, setParameterBanner] = useState<
    { tone: 'info' | 'success' | 'error'; text: string } | null
  >(null);
  const [volatilityEditorState, setVolatilityEditorState] = useState<VolatilityEditorState>({
    open: false,
    definition: null,
    initialValue: {},
    error: null
  });
  const [disabledRegimesEditorState, setDisabledRegimesEditorState] =
    useState<DisabledRegimesEditorState>({
      open: false,
      definition: null,
      initialValue: [],
      error: null
    });
  const parameterEditorRef = useRef<HTMLInputElement | HTMLSelectElement | null>(null);
  const symbolEditorRef = useRef<HTMLInputElement | null>(null);
  const scheduleTimezoneEditorRef = useRef<HTMLSelectElement | null>(null);
  const lastSubmittedParameterRef = useRef<{ name: string; label: string } | null>(null);
  const previousParameterStatusRef = useRef<RequestStatus>(parameterStatus);

  const baselineSummary = useMemo(() => {
    if (!strategy?.id) {
      return { symbol: '', source: '', origin: '' };
    }
    const symbol = detail?.primarySymbol ?? strategy?.symbol ?? '';
    const dataSourceRaw = detail?.dataSource ?? strategy?.dataSource ?? null;
    const source = parseDataSourceValue(dataSourceRaw);
    const origin = (detail?.strategyOrigin ?? strategy?.strategyOrigin ?? '').toLowerCase();
    return {
      symbol,
      source,
      origin: origin || ''
    };
  }, [
    strategy?.id,
    detail?.primarySymbol,
    detail?.dataSource,
    detail?.strategyOrigin,
    strategy?.symbol,
    strategy?.dataSource,
    strategy?.strategyOrigin
  ]);

  const summaryEditAllowed = useMemo(() => {
    if (!strategy?.id) {
      return false;
    }
    const status = strategy.status;
    if (status === 'running' || status === 'starting') {
      return false;
    }
    if (strategy.active) {
      return false;
    }
    return true;
  }, [strategy?.id, strategy?.status, strategy?.active]);

  useEffect(() => {
    if (!strategy?.id) {
      setSummarySymbol('');
      setIsEditingSymbol(false);
      return;
    }
    if (!isEditingSymbol) {
      setSummarySymbol(baselineSummary.symbol);
    }
  }, [strategy?.id, baselineSummary.symbol, isEditingSymbol]);

  useEffect(() => {
    if (isEditingSymbol && symbolEditorRef.current) {
      symbolEditorRef.current.focus();
      symbolEditorRef.current.select();
    }
  }, [isEditingSymbol]);

  const baselineRisk = useMemo(() => {
    const settings = riskSettings ?? null;
    const maxPosition = settings?.maxPosition;
    const lossThreshold = settings?.lossThreshold;
    const lossDuration = settings?.lossDurationMinutes;
    return {
      maxPosition: typeof maxPosition === 'number' && Number.isFinite(maxPosition) ? String(maxPosition) : '',
      lossThreshold: typeof lossThreshold === 'number' && Number.isFinite(lossThreshold) ? String(lossThreshold) : '',
      lossDuration: typeof lossDuration === 'number' && Number.isFinite(lossDuration) ? String(lossDuration) : '',
      forbidPyramiding: settings?.forbidPyramiding ?? false,
      notifyOnBreach: settings?.notifyOnBreach ?? true
    };
  }, [riskSettings]);

  useEffect(() => {
    if (!strategy?.id) {
      setRiskMaxPosition('');
      setRiskLossThreshold('');
      setRiskLossDuration('');
      setRiskForbidPyramiding(false);
      setRiskNotifyOnBreach(true);
      return;
    }
    setRiskMaxPosition(baselineRisk.maxPosition);
    setRiskLossThreshold(baselineRisk.lossThreshold);
    setRiskLossDuration(baselineRisk.lossDuration);
    setRiskForbidPyramiding(baselineRisk.forbidPyramiding);
    setRiskNotifyOnBreach(baselineRisk.notifyOnBreach);
  }, [
    strategy?.id,
    baselineRisk.maxPosition,
    baselineRisk.lossThreshold,
    baselineRisk.lossDuration,
    baselineRisk.forbidPyramiding,
    baselineRisk.notifyOnBreach
  ]);

  useEffect(() => {
    setEditingParameter(null);
    setEditingDraftValue('');
    setParameterInlineError(null);
    setPendingParameter(null);
    setParameterBanner(null);
    lastSubmittedParameterRef.current = null;
    previousParameterStatusRef.current = 'idle';
  }, [strategy?.id]);
  const exitParameterDefinitions = useMemo(() => {
    const fromDetailArray = normalizeExitConfigDefinitions(
      (detail?.exit_config as Array<Record<string, unknown>> | null | undefined) ?? null
    );
    if (fromDetailArray.length) return fromDetailArray;
    const fromDetailParams = extractExitConfigFromParameters(
      (detail?.parameters as Record<string, unknown> | null | undefined) ?? null
    );
    if (fromDetailParams.length) return fromDetailParams;
    const fromStrategyParams = extractExitConfigFromParameters(
      (strategy?.parameters as unknown as Record<string, unknown> | null | undefined) ?? null
    );
    return fromStrategyParams;
  }, [detail?.exit_config, detail?.parameters, strategy?.parameters]);
  const detailParameters: Record<string, unknown> | null = useMemo(() => {
    const parameterRecord = isRecord(detail?.parameters)
      ? (detail?.parameters as Record<string, unknown>)
      : toParameterRecord(detail?.parameterDefinitions ?? strategy?.parameters ?? null);
    const exitRecord = toParameterRecord(exitParameterDefinitions);
    if (!parameterRecord && !exitRecord) {
      return null;
    }
    return {
      ...(parameterRecord ?? {}),
      ...(exitRecord ?? {})
    };
  }, [detail?.parameters, detail?.parameterDefinitions, strategy?.parameters, exitParameterDefinitions]);
  const resubscribeInstrument = useMemo(
    () =>
      extractStrategyInstrumentMetadata(
        detailParameters,
        strategy?.parameters ?? null,
        runtimeDetail
      ),
    [detailParameters, strategy?.parameters, runtimeDetail]
  );
  const baselineResubscribeConId = useMemo(
    () => formatConIdDisplay(resubscribeInstrument.conId),
    [resubscribeInstrument]
  );

  useEffect(() => {
    const currentStrategyId = strategy?.id ?? null;
    const previousStrategyId = resubscribeStrategyIdRef.current;
    const strategyChanged = previousStrategyId !== currentStrategyId;
    if (strategyChanged) {
      if (resubscribeConId !== baselineResubscribeConId) {
        setResubscribeConId(baselineResubscribeConId);
      }
      if (resubscribeConIdDirty) {
        setResubscribeConIdDirty(false);
      }
    } else if (!resubscribeConIdDirty && resubscribeConId !== baselineResubscribeConId) {
      setResubscribeConId(baselineResubscribeConId);
    }
    resubscribeStrategyIdRef.current = currentStrategyId;
  }, [
    strategy?.id,
    baselineResubscribeConId,
    resubscribeConId,
    resubscribeConIdDirty
  ]);
  const parameterTemplate =
    detailParameters && typeof detailParameters['strategy_type'] === 'string'
      ? (detailParameters['strategy_type'] as string)
      : null;

  const getParameterValue = useCallback(
    (name: string): string | null => {
      if (detailParameters && Object.prototype.hasOwnProperty.call(detailParameters, name)) {
        const value = detailParameters[name];
        if (value === null || value === undefined) {
          return null;
        }
        return typeof value === 'string' ? value : String(value);
      }
      const parameterEntry = strategy?.parameters?.find((parameter) => parameter.name === name);
      if (parameterEntry) {
        const value = parameterEntry.value ?? parameterEntry.defaultValue ?? null;
        if (value === null || value === undefined) {
          return null;
        }
        return typeof value === 'string' ? value : String(value);
      }
      return null;
    },
    [detailParameters, strategy?.parameters]
  );

  const parameterDataSource = getParameterValue('data_source');

  const getSecondarySubscription = useCallback(() => {
    const detailSymbol =
      typeof detail?.secondarySymbol === 'string' ? detail.secondarySymbol.trim() : '';
    const parameterSymbol = getParameterValue('symbol2')?.trim() ?? '';
    const symbol = detailSymbol || parameterSymbol || null;
    const interval2 = getParameterValue('interval2')?.trim() ?? '';
    const intervals2 = getParameterValue('intervals2')?.trim() ?? '';
    const hasIntervals = Boolean(interval2 || intervals2);
    return { symbol, hasIntervals };
  }, [detail?.secondarySymbol, getParameterValue]);

  const resolvedTemplate = useMemo(() => {
    const fromDetail = detail?.strategyType;
    if (typeof fromDetail === 'string' && fromDetail.trim()) {
      return fromDetail.trim();
    }
    const fromStrategy = strategy?.templateId;
    if (typeof fromStrategy === 'string' && fromStrategy.trim()) {
      return fromStrategy.trim();
    }
    if (typeof parameterTemplate === 'string' && parameterTemplate.trim()) {
      return parameterTemplate.trim();
    }
    const fallbackName = strategy?.id ?? strategy?.name ?? null;
    return fallbackName ?? null;
  }, [detail?.strategyType, strategy?.templateId, strategy?.id, strategy?.name, parameterTemplate]);

  const strategyTypeCandidate =
    strategy && typeof (strategy as { strategyType?: unknown }).strategyType === 'string'
      ? ((strategy as { strategyType?: string | null }).strategyType as string)
      : null;

  const normalizedRuntimeTemplate = useMemo(() => {
    const candidates = [
      detail?.strategyType,
      strategyTypeCandidate,
      strategy?.templateId,
      parameterTemplate,
      resolvedTemplate
    ];
    for (const candidate of candidates) {
      if (typeof candidate === 'string') {
        const trimmed = candidate.trim();
        if (trimmed) {
          return trimmed.toLowerCase();
        }
      }
    }
    return '';
  }, [
    detail?.strategyType,
    strategyTypeCandidate,
    strategy?.templateId,
    parameterTemplate,
    resolvedTemplate
  ]);

  const explicitIsKlineStrategy = useMemo(() => {
    if (typeof detail?.isKlineStrategy === 'boolean') {
      return detail.isKlineStrategy;
    }
    if (typeof strategy?.isKlineStrategy === 'boolean') {
      return strategy.isKlineStrategy;
    }
    return null;
  }, [detail?.isKlineStrategy, strategy?.isKlineStrategy]);

  const isKlineStrategy = useMemo(() => {
    if (explicitIsKlineStrategy !== null) {
      return explicitIsKlineStrategy;
    }
    return includesKeyword(normalizedRuntimeTemplate, KLINE_KEYWORDS);
  }, [explicitIsKlineStrategy, normalizedRuntimeTemplate]);
  const isScreenerStrategy = useMemo(
    () =>
      checkIsScreenerStrategy(strategy) ||
      (strategy
        ? checkIsScreenerStrategy({
            ...strategy,
            templateId: normalizedRuntimeTemplate,
            screenerProfile: detail?.screenerProfile ?? strategy.screenerProfile
          })
        : false),
    [normalizedRuntimeTemplate, detail?.screenerProfile, strategy]
  );

  useEffect(() => {
    if (activeTab === 'screener' && !isScreenerStrategy) {
      setActiveTab('summary');
    }
  }, [activeTab, isScreenerStrategy]);

  useEffect(() => {
    if (!strategy?.id) {
      return;
    }
    if (isScreenerStrategy) {
      setActiveTab('screener');
    }
  }, [isScreenerStrategy, strategy?.id]);
  const isDynamicOrbStrategy = useMemo(
    () => normalizedRuntimeTemplate.includes('dynamic_orb_breakout'),
    [normalizedRuntimeTemplate]
  );

  const resolvedDataSourceLabel = useMemo(() => {
    const candidate =
      (typeof detail?.dataSource === 'string' && detail.dataSource.trim())
        ? detail.dataSource.trim()
        : (typeof strategy?.dataSource === 'string' && strategy.dataSource.trim())
            ? strategy.dataSource.trim()
            : parameterDataSource && parameterDataSource.trim()
                ? parameterDataSource.trim()
                : null;
    if (candidate) {
      return getDataSourceLabel(candidate);
    }
    if (resolvedTemplate) {
      const normalized = resolvedTemplate.toLowerCase();
      if (normalized.includes('dom')) {
        return 'DOM Feed';
      }
      if (normalized.includes('candle') || normalized.includes('mean')) {
        return 'Market Data Feed';
      }
    }
    return 'Market Data Feed';
  }, [detail?.dataSource, strategy?.dataSource, parameterDataSource, resolvedTemplate]);

  const summaryMode: 'kline' | 'dom' = isKlineStrategy ? 'kline' : 'dom';

  const riskDirty = useMemo(() => {
    if (!strategy?.id) {
      return false;
    }
    return (
      riskMaxPosition.trim() !== baselineRisk.maxPosition.trim() ||
      riskLossThreshold.trim() !== baselineRisk.lossThreshold.trim() ||
      riskLossDuration.trim() !== baselineRisk.lossDuration.trim() ||
      riskForbidPyramiding !== baselineRisk.forbidPyramiding ||
      riskNotifyOnBreach !== baselineRisk.notifyOnBreach
    );
  }, [
    strategy?.id,
    riskMaxPosition,
    riskLossThreshold,
    riskLossDuration,
    riskForbidPyramiding,
    riskNotifyOnBreach,
    baselineRisk.maxPosition,
    baselineRisk.lossThreshold,
    baselineRisk.lossDuration,
    baselineRisk.forbidPyramiding,
    baselineRisk.notifyOnBreach
  ]);

  useEffect(() => {
    setSelectedPeriod('day');
    setActiveTab('summary');
    setCandlesInterval('5m');
    lastLoadedOrdersPageRef.current = null;
    setOrdersPage(1);
    setLoadedRisk(false);
    setLoadedRuntime(false);
    setLoadedSections({});
    setSectionLoading({});
    setSectionErrors({});
  }, [strategy?.id, setSelectedPeriod]);

  useEffect(() => {
    setLoadedSections({});
    setSectionLoading({});
    setSectionErrors({});
    lastLoadedOrdersPageRef.current = null;
    setOrdersPage(1);
  }, [selectedPeriod]);

  const requestPerformanceSection = useCallback(
    async (
      section: StrategyPerformanceSection,
      options: { page?: number; pageSize?: number } = {}
    ) => {
      if (!strategy?.id || isScreenerStrategy) {
        return;
      }
      const resolvedPage = section === 'orders' ? options.page ?? 1 : options.page;
      const resolvedPageSize =
        section === 'orders' ? options.pageSize ?? ORDERS_PAGE_SIZE : options.pageSize;

      setSectionLoading((prev) => ({ ...prev, [section]: true }));
      setSectionErrors((prev) => ({ ...prev, [section]: null }));

      try {
        // Use individual thunks based on section
        let thunk: 
          | typeof loadStrategyPerformanceSummary
          | typeof loadStrategyPerformanceOrders
          | typeof loadStrategyPerformanceCharts
          | typeof loadStrategyPerformanceCalendar;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let payload: any;
        
        switch (section) {
          case 'summary':
            thunk = loadStrategyPerformanceSummary;
            payload = { strategyId: strategy.id, period: selectedPeriod };
            break;
          case 'orders': {
            thunk = loadStrategyPerformanceOrders;
            // Use calendar dates from store if available, otherwise use period-based filtering
            const calendarData = performanceFromStore?.calendar;
            
            // If calendar data is available, use it for date filtering
            // Otherwise, calculate date range based on selected period to ensure proper filtering
            let startDate: string | undefined;
            let endDate: string | undefined;
            
            if (calendarData?.start && calendarData?.end) {
              const tz = ordersTimezoneRef.current;
              const startParts = getZonedDateParts(calendarData.start, tz);
              const endParts = getZonedDateParts(calendarData.end, tz);
              const zonedStart = buildZonedDate({ year: startParts.year, month: startParts.month - 1, date: startParts.day }, tz);
              const zonedEnd = buildZonedDate({ year: endParts.year, month: endParts.month - 1, date: endParts.day, hour: 23, minute: 59, second: 59, millisecond: 999 }, tz);
              startDate = zonedStart.toISOString();
              endDate = zonedEnd.toISOString();
            } else {
              // Calculate date range based on selected period to avoid showing all historical orders
              const tz = ordersTimezoneRef.current;
              const range = buildPeriodRange(selectedPeriod, { timezone: tz });
              startDate = range.startDate;
              endDate = range.endDate;
            }
            
            payload = { 
              strategyId: strategy.id, 
              period: selectedPeriod,
              page: resolvedPage,
              pageSize: resolvedPageSize,
              // Include calculated date range for proper filtering
              ...(startDate && { startDate }),
              ...(endDate && { endDate })
            };
            break;
          }
          case 'charts':
            thunk = loadStrategyPerformanceCharts;
            payload = { strategyId: strategy.id, period: selectedPeriod };
            break;
          case 'calendar':
            thunk = loadStrategyPerformanceCalendar;
            payload = { strategyId: strategy.id, period: selectedPeriod };
            break;
          default:
            // Fallback - should not reach here with current sections
            throw new Error(`Unknown section: ${section}`);
        }

        // Use type assertion to handle union type issue
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (dispatch(thunk(payload) as any)).unwrap();

        setLoadedSections((prev) => ({ ...prev, [section]: true }));
      } catch (error) {
        const message = error instanceof Error ? error.message : '加载失败';
        setSectionErrors((prev) => ({ ...prev, [section]: message }));
        setLoadedSections((prev) => {
          const next = { ...prev };
          delete next[section];
          return next;
        });
      } finally {
        setSectionLoading((prev) => ({ ...prev, [section]: false }));
      }
    },
    [dispatch, strategy?.id, selectedPeriod, performanceFromStore?.calendar, isScreenerStrategy]
  );

  const detailRequestingRef = useRef<boolean>(false);
  useEffect(() => {
    if (!active || !strategy?.id) {
      return;
    }
    if (detailRequestingRef.current) {
      return;
    }
    detailRequestingRef.current = true;
    void dispatch(loadStrategyDetail({ strategyId: strategy.id }))
      .finally(() => {
        detailRequestingRef.current = false;
      });
  }, [dispatch, strategy?.id, active]);

  useEffect(() => {
    setLoadedRisk(false);
    setLoadedRuntime(false);
    setLoadedSections({});
    setSectionLoading({});
    setSectionErrors({});
  }, [strategy?.id]);

  useEffect(() => {
    if (!performance || performance.period !== selectedPeriod) {
      return;
    }
    setLoadedSections((prev) => {
      let changed = false;
      const next = { ...prev };
      if (performance.summary && !next.summary) {
        next.summary = true;
        changed = true;
      }
      if (performance.orders && !next.orders) {
        next.orders = true;
        changed = true;
      }
      if (performance.charts && !next.charts) {
        next.charts = true;
        changed = true;
      }
      if (performance.calendar && !next.calendar) {
        next.calendar = true;
        changed = true;
      }
      return changed ? next : prev;
    });
  }, [performance, selectedPeriod]);



  useEffect(() => {
    if (!active || !strategy?.id || activeTab !== 'summary' || loadedSections.summary || summaryLoading) {
      return;
    }
    void requestPerformanceSection('summary');
  }, [strategy?.id, activeTab, loadedSections.summary, summaryLoading, requestPerformanceSection, active]);

  useEffect(() => {
    if (!active || !strategy?.id || activeTab !== 'orders') {
      return;
    }
    if (ordersSectionLoading) {
      return;
    }

    const currentPage = performanceFromStore?.page ?? null;
    const currentPeriod = performanceFromStore?.period ?? null;
    const needsLoad =
      !loadedSections.orders || currentPeriod !== selectedPeriod || currentPage !== ordersPage;

    if (!needsLoad) {
      return;
    }

    void requestPerformanceSection('orders', { page: ordersPage, pageSize: ORDERS_PAGE_SIZE });
    lastLoadedOrdersPageRef.current = ordersPage;
  }, [
    strategy?.id,
    activeTab,
    ordersPage,
    ordersSectionLoading,
    loadedSections.orders,
    performanceFromStore?.page,
    performanceFromStore?.period,
    selectedPeriod,
    requestPerformanceSection,
    active
  ]);

  // REMOVED: This effect was causing unnecessary reloads on page changes
  // Pagination should be handled by the orders loading effect directly
  // useEffect(() => {
  //   setLoadedSections((prev) => {
  //     if (!prev.orders) {
  //       return prev;
  //     }
  //     const next = { ...prev };
  //     delete next.orders;
  //     return next;
  //   });
  // }, [ordersPage]);

  useEffect(() => {
    if (!ordersSectionError) {
      return;
    }
    lastLoadedOrdersPageRef.current = null;
    setLoadedSections((prev) => {
      if (!prev.orders) {
        return prev;
      }
      const next = { ...prev };
      delete next.orders;
      return next;
    });
  }, [ordersSectionError]);

  useEffect(() => {
    if (!active || !strategy?.id) {
      return;
    }
    if (activeTab === 'visual' && !loadedSections.charts && !chartsLoading) {
      void requestPerformanceSection('charts');
    }
    if (activeTab === 'calendar' && !loadedSections.calendar && !calendarLoading) {
      void requestPerformanceSection('calendar');
    }
  }, [
    strategy?.id,
    activeTab,
    loadedSections.charts,
    loadedSections.calendar,
    chartsLoading,
    calendarLoading,
    requestPerformanceSection,
    active
  ]);

  useEffect(() => {
    if (!active || !strategy?.id || activeTab !== 'risk' || loadedRisk) {
      return;
    }
    setLoadedRisk(true);
    void dispatch(loadStrategyRiskSettings({ strategyId: strategy.id }));
  }, [dispatch, strategy?.id, activeTab, loadedRisk, active]);

  useEffect(() => {
    const strategyId = strategy?.id;
    const strategyStatus = strategy?.status;

    if (!active || !strategyId) {
      return;
    }
    const shouldLoad = (strategyStatus === 'running' || strategyStatus === 'starting') && !loadedRuntime;
    if (shouldLoad) {
      setLoadedRuntime(true);
      void dispatch(
        loadStrategyRuntime({
          strategyId: strategyId,
          refresh: true
        })
      );
    }
  }, [dispatch, strategy?.id, strategy?.status, active, loadedRuntime]);

  useEffect(() => {
    if (!active || !strategy?.id || activeTab !== 'candles') {
      return;
    }
    void dispatch(
      loadStrategyCandles({
        strategyId: strategy.id,
        interval: candlesInterval
      })
    );
  }, [
    dispatch,
    strategy?.id,
    activeTab,
    candlesInterval,
    active
  ]);

  const domRuntimeMetricsList = useDomRuntimeMetrics(summaryMode === 'dom' ? runtimeDetail : null);
  const primaryDomRuntimeMetrics = useMemo(() => {
    if (!domRuntimeMetricsList.length) {
      return buildDomRuntimeMetrics(null)[0]!;
    }
    const preferredSymbol =
      (typeof detail?.primarySymbol === 'string' && detail.primarySymbol.trim()) ||
      (typeof strategy?.symbol === 'string' && strategy.symbol.trim()) ||
      '';
    if (preferredSymbol) {
      const matched = domRuntimeMetricsList.find(
        (metrics) => (metrics.dataPushSymbol ?? '').trim() === preferredSymbol
      );
      if (matched) {
        return matched;
      }
    }
    return domRuntimeMetricsList[0];
  }, [detail?.primarySymbol, domRuntimeMetricsList, strategy?.symbol]);
  const klineRuntimeMetrics = useKlineRuntimeMetrics(runtimeDetail, normalizedRuntimeTemplate);
  const runtimeLogHintText = useMemo(
    () => (isKlineStrategy ? null : formatDataFeedHint(primaryDomRuntimeMetrics)),
    [isKlineStrategy, primaryDomRuntimeMetrics]
  );
  const receivingHintText = runtimeLogHintText;
  const runtimeMode: 'dom' | 'kline' = isKlineStrategy ? 'kline' : 'dom';

  const resubscribeSymbol = useMemo(() => {
    if (isKlineStrategy) {
      return '';
    }
    const metricSymbol = primaryDomRuntimeMetrics.dataPushSymbol;
    if (typeof metricSymbol === 'string') {
      const trimmedMetric = metricSymbol.trim();
      if (trimmedMetric) {
        return trimmedMetric;
      }
    }

    const summaryCandidate = summarySymbol.trim();
    if (summaryCandidate) {
      return summaryCandidate;
    }

    const baselineSymbol =
      typeof baselineSummary.symbol === 'string' ? baselineSummary.symbol.trim() : '';
    if (baselineSymbol) {
      return baselineSymbol;
    }

    const fallbackSymbol = typeof strategy?.symbol === 'string' ? strategy.symbol.trim() : '';
    return fallbackSymbol;
  }, [
    isKlineStrategy,
    primaryDomRuntimeMetrics.dataPushSymbol,
    summarySymbol,
    baselineSummary.symbol,
    strategy?.symbol
  ]);

  const receivingResubscribeEligible = useMemo(
    () =>
      !isKlineStrategy &&
      isBrokenSubscriptionCause(
        primaryDomRuntimeMetrics.receivingCauseCode,
        primaryDomRuntimeMetrics.receivingCause
      ),
    [
      isKlineStrategy,
      primaryDomRuntimeMetrics.receivingCauseCode,
      primaryDomRuntimeMetrics.receivingCause
    ]
  );
  const domReceivingIsOff =
    primaryDomRuntimeMetrics.isReceivingData === false && !primaryDomRuntimeMetrics.awaitingData;

  const renderSubscriptionStatus = (metrics: DomRuntimeMetricsViewModel): JSX.Element | null => {
    if (!metrics.subscriptionStatuses.length) {
      return null;
    }
    return (
      <div className={styles.runtimeMetric}>
        <div className={styles.runtimeMetricLabel}>订阅状态</div>
        <ul className={styles.runtimeSubscriptionList}>
          {metrics.subscriptionStatuses.map((entry, index) => {
            const keyParts = [entry.symbol, entry.interval, entry.subscribedAt, index]
              .filter((part) => part !== null && part !== undefined && part !== '');
            const itemKey = keyParts.length ? keyParts.join('-') : `subscription-${index}`;
            return (
              <li key={itemKey} className={styles.runtimeSubscriptionItem}>
                <span className={styles.runtimeSubscriptionSymbol}>{entry.symbol}</span>
                {entry.interval ? (
                  <span className={styles.runtimeSubscriptionMeta}>{entry.interval}</span>
                ) : null}
                {entry.subscribedAt ? (
                  <span className={styles.runtimeSubscriptionMeta}>{entry.subscribedAt}</span>
                ) : null}
              </li>
            );
          })}
        </ul>
      </div>
    );
  };

  const runtimeResyncStatus = subscriptionResyncStatus;
  const runtimeResyncError = subscriptionResyncError;
  const runtimeResyncPending = runtimeResyncStatus === 'loading';

  const handleRuntimeResync = useCallback(
    async (event: MouseEvent<HTMLButtonElement>) => {
      event.stopPropagation();
      if (!strategyKey || runtimeResyncPending) {
        return;
      }
      try {
        const result = await dispatch(
          resyncStrategySubscription({ strategyId: strategyKey })
        ).unwrap();
        const strategyName = strategy?.name ?? '策略';
        if (result.refreshed) {
          dispatch(
            addToast({
              message: result.message ?? `${strategyName}订阅已重新同步`,
              variant: 'success',
              preventDuplicates: true
            })
          );
        } else {
          const message =
            result.message ??
            runtimeResyncError ??
            `${strategyName}订阅状态未更新，请稍后重试`;
          dispatch(
            addToast({
              message,
              variant: 'error',
              preventDuplicates: true
            })
          );
        }
      } catch (error) {
        const strategyName = strategy?.name ?? '策略';
        const message =
          typeof error === 'string'
            ? error
            : error instanceof Error && error.message
            ? error.message
            : `${strategyName}订阅重新同步失败`;
        dispatch(
          addToast({
            message,
            variant: 'error',
            preventDuplicates: true
          })
        );
      }
    },
    [dispatch, strategyKey, runtimeResyncPending, strategy?.name, runtimeResyncError]
  );

  const handleResubscribeConIdChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      setResubscribeConId(event.target.value);
      setResubscribeConIdDirty(true);
    },
    []
  );

  const handleResubscribe = useCallback(async () => {
    if (isKlineStrategy || resubscribePending) {
      return;
    }
    if (!receivingResubscribeEligible) {
      dispatch(
        addToast({
          message: '当前订阅状态无需重新订阅。',
          variant: 'info',
          preventDuplicates: true
        })
      );
      return;
    }
    if (!authToken) {
      dispatch(
        addToast({
          message: '缺少访问令牌，无法重新订阅。',
          variant: 'error',
          preventDuplicates: true
        })
      );
      return;
    }
    if (!resubscribeSymbol) {
      dispatch(
        addToast({
          message: '当前策略缺少订阅标的，无法重新订阅。',
          variant: 'error',
          preventDuplicates: true
        })
      );
      return;
    }

    setResubscribePending(true);
    try {
      const payload: MarketSubscriptionStartPayload = {
        symbol: resubscribeSymbol,
        enableDom: true,
        enableTicker: true,
        enableBars: true
      };
      if (clientId) {
        payload.ownerId = `ws:${clientId}`;
      }
      await startMarketSubscription(authToken, payload);
      const { symbol: secondarySymbol, hasIntervals } = getSecondarySubscription();
      if (
        secondarySymbol &&
        hasIntervals &&
        secondarySymbol.trim() &&
        secondarySymbol.trim() !== resubscribeSymbol
      ) {
        const secondaryPayload: MarketSubscriptionStartPayload = {
          symbol: secondarySymbol.trim(),
          enableDom: true,
          enableTicker: true,
          enableBars: true
        };
        if (clientId) {
          secondaryPayload.ownerId = `ws:${clientId}`;
        }
        await startMarketSubscription(authToken, secondaryPayload);
      }
      dispatch(
        addToast({
          message: `已重新请求 DOM 订阅：${resubscribeSymbol}`,
          variant: 'success'
        })
      );
    } catch (error) {
      const detail = error instanceof Error ? error.message : '未知错误';
      dispatch(
        addToast({
          message: `重新订阅失败：${detail}`,
          variant: 'error'
        })
      );
    } finally {
      setResubscribePending(false);
    }
  }, [
    authToken,
    clientId,
    dispatch,
    receivingResubscribeEligible,
    isKlineStrategy,
    resubscribePending,
    resubscribeSymbol,
    getSecondarySubscription
  ]);


  const metricsUpdatedAt = metrics?.updatedAt ?? null;
  const metricsLastUpdatedAt = metrics?.lastUpdatedAt ?? null;

  const performanceSummary = useMemo<Record<string, number | string | null>>(() => {
    return (performance?.summary as Record<string, number | string | null> | undefined) ?? {};
  }, [performance?.summary]);
  const performanceCharts = performance?.charts ?? null;
  const calendarData = performance?.calendar ?? null;
  const chartsError = sectionErrors.charts ?? null;
  const calendarError = sectionErrors.calendar ?? null;
  const ordersSnapshot = performanceFromStore ?? null;
  const resolvedOrdersPage = ordersSectionLoading
    ? ordersPage
    : ordersSnapshot?.page ?? ordersPage;
  const resolvedOrdersPageSize = ordersSnapshot?.pageSize ?? ORDERS_PAGE_SIZE;
  const resolvedOrdersTotal = ordersSnapshot?.totalOrders ?? ordersSnapshot?.orders?.length ?? 0;
  const ordersTotalPages =
    resolvedOrdersPageSize > 0
      ? Math.max(1, Math.ceil(resolvedOrdersTotal / resolvedOrdersPageSize))
      : 1;
  const hasNextOrdersPage = ordersSectionLoading
    ? ordersPage < ordersTotalPages
    : ordersSnapshot?.hasNext ?? resolvedOrdersPage < ordersTotalPages;
  const hasPreviousOrdersPage = ordersSectionLoading ? ordersPage > 1 : resolvedOrdersPage > 1;
  const performanceMarketTimezone = ordersSnapshot?.marketTimezone ?? null;
  const localTimezone = useMemo(
    () => getLocalTimezone(performanceMarketTimezone ?? null),
    [performanceMarketTimezone]
  );
  const candleTradeMarkers = useMemo<TradeMarker[]>(() => {
    if (!candleTimeBounds) {
      return [];
    }
    const orders = ordersSnapshot?.orders ?? performance?.orders ?? [];
    if (!orders.length) {
      return [];
    }

    return orders
      .map((order) => {
        const rawTimestamp = order.executedAt ?? order.timestamp ?? null;
        const parsedTimestamp = rawTimestamp ? new Date(rawTimestamp).getTime() : NaN;
        if (!Number.isFinite(parsedTimestamp)) {
          return null;
        }

        if (parsedTimestamp < candleTimeBounds.start || parsedTimestamp > candleTimeBounds.end) {
          return null;
        }

        const side = order.side?.toString().toLowerCase();
        if (side !== 'buy' && side !== 'sell') {
          return null;
        }

        const rawPrice = order.averagePrice ?? order.price ?? null;
        const resolvedPrice =
          typeof rawPrice === 'number' && Number.isFinite(rawPrice) ? rawPrice : undefined;

        return {
          id: order.id ?? `${parsedTimestamp}-${side}`,
          timestamp: rawTimestamp,
          side,
          price: resolvedPrice
        } as TradeMarker;
      })
      .filter((marker): marker is TradeMarker => Boolean(marker))
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  }, [candleTimeBounds, ordersSnapshot?.orders, performance?.orders]);
  const ordersTimezoneRef = useRef<string>(localTimezone);
  const goToPreviousOrdersPage = useCallback(() => {
    if (!hasPreviousOrdersPage || ordersSectionLoading) {
      return;
    }
    setOrdersPage((prev) => Math.max(1, prev - 1));
  }, [hasPreviousOrdersPage, ordersSectionLoading]);
  const goToNextOrdersPage = useCallback(() => {
    if (!hasNextOrdersPage || ordersSectionLoading) {
      return;
    }
    setOrdersPage((prev) => prev + 1);
  }, [hasNextOrdersPage, ordersSectionLoading]);

  const runtimeSummaryMetrics = useMemo<Record<string, number | string | null>>(() => {
    const summary = runtimeDetail?.snapshot?.summary;
    if (summary && typeof summary === 'object') {
      return summary as Record<string, number | string | null>;
    }
    return {};
  }, [runtimeDetail?.snapshot?.summary]);

  const totalTriggers = useMemo(() => {
    if (runtimeDetail?.triggerCount != null) {
      return runtimeDetail.triggerCount;
    }
    if (detail?.triggerCount != null) {
      return detail.triggerCount;
    }
    if (strategy?.triggerCount != null) {
      return strategy.triggerCount;
    }
    const keys = ['trigger_count', 'total_triggers', 'execution_count', 'trade_count', 'total_trades'];
    const performanceValue = resolveMetricValue(performanceSummary, keys);
    if (performanceValue !== null && performanceValue !== undefined) {
      return performanceValue;
    }
    const runtimeValue = resolveMetricValue(runtimeSummaryMetrics, keys);
    if (runtimeValue !== null && runtimeValue !== undefined) {
      return runtimeValue;
    }
    return null;
  }, [
    runtimeDetail?.triggerCount,
    detail?.triggerCount,
    strategy?.triggerCount,
    performanceSummary,
    runtimeSummaryMetrics
  ]);
  const totalTrades = useMemo<MetricValue>(() => {
    const keys = ['trade_count', 'trades', 'total_trades', 'execution_count', 'executions'];
    const performanceValue = resolveMetricValue(performanceSummary, keys);
    if (performanceValue !== null && performanceValue !== undefined) {
      return performanceValue;
    }
    const runtimeValue = resolveMetricValue(runtimeSummaryMetrics, keys);
    if (runtimeValue !== null && runtimeValue !== undefined) {
      return runtimeValue;
    }
    return null;
  }, [performanceSummary, runtimeSummaryMetrics]);

  const lastTriggered = useMemo(() => {
    if (runtimeDetail?.lastTriggeredAt) {
      return runtimeDetail.lastTriggeredAt;
    }
    if (detail?.lastTriggeredAt) {
      return detail.lastTriggeredAt;
    }
    if (strategy?.lastTriggeredAt) {
      return strategy.lastTriggeredAt;
    }
    if (performance?.orders?.length) {
      return performance.orders[0]?.timestamp ?? strategy?.lastUpdatedAt ?? null;
    }
    return strategy?.lastUpdatedAt ?? null;
  }, [runtimeDetail?.lastTriggeredAt, detail?.lastTriggeredAt, strategy?.lastTriggeredAt, performance, strategy?.lastUpdatedAt]);

  const summarySaving = summaryStatus === 'loading';
  const summarySucceeded = summaryStatus === 'succeeded';
  const summaryFailed = summaryStatus === 'failed';
  const runtimeLoading = runtimeStatus === 'loading';
  const riskLoading = riskStatus === 'loading';
  const riskFailed = riskStatus === 'failed';
  const riskSaving = riskSaveStatus === 'loading';
  const riskSaveSucceeded = riskSaveStatus === 'succeeded';
  const riskSaveFailed = riskSaveStatus === 'failed';
  const runtimeRefreshedAt = runtimeDetail?.snapshot?.refreshedAt ?? null;
  useEffect(() => {
    try {
      const snapshotObj = (runtimeDetail?.snapshot ?? null) as Record<string, unknown> | null;
      const logsCandidate = snapshotObj && Array.isArray((snapshotObj as Record<string, unknown>).logs)
        ? ((snapshotObj as Record<string, unknown>).logs as unknown[])
        : [];
      const logTimestamps: Array<string | null> = logsCandidate.map((entry) => {
        const ts = (entry as Record<string, unknown>)?.timestamp;
        return typeof ts === 'string' ? ts : null;
      });
      console.debug('[RuntimeUI][update]', {
        strategyId: runtimeDetail?.strategyId ?? null,
        refreshedAt: runtimeRefreshedAt,
        logTimestamps
      });
    } catch (e) {
      void e;
    }
  }, [runtimeDetail, runtimeRefreshedAt]);
  const signalGenerationPhase = useMemo(
    () =>
      runtimeMode === 'kline'
        ? klineRuntimeMetrics.phases.find((phase) => phase.key === 'signal_generation') ?? null
        : null,
    [klineRuntimeMetrics.phases, runtimeMode]
  );
  const subscriptionPhase = useMemo(
    () =>
      runtimeMode === 'kline'
        ? klineRuntimeMetrics.phases.find((phase) => phase.key === 'subscription') ?? null
        : null,
    [klineRuntimeMetrics.phases, runtimeMode]
  );
  const headerLogPreview = useMemo<{ subscription: RuntimeLogEntry[]; stage: RuntimeLogEntry[]; processing: RuntimeLogEntry[] }>(
    () => ({
      subscription: subscriptionPhase?.logs ?? [],
      stage: signalGenerationPhase?.stageSignals ?? [],
      processing: signalGenerationPhase?.dataProcessingLogs ?? []
    }),
    [signalGenerationPhase, subscriptionPhase]
  );
  const headerLogColumns = useMemo(
    () => [
      {
        key: 'subscription',
        title: '数据订阅',
        logs: headerLogPreview.subscription,
        empty: '暂无订阅日志'
      },
      {
        key: 'stage',
        title: '阶段 / 入场',
        logs: headerLogPreview.stage,
        empty: '暂无阶段信号'
      },
      {
        key: 'processing',
        title: '数据处理',
        logs: headerLogPreview.processing,
        empty: '暂无处理日志'
      }
    ],
    [headerLogPreview.processing, headerLogPreview.stage, headerLogPreview.subscription]
  );
  const runtimeStatusText = runtimeDetail
    ? runtimeDetail.status.active
      ? '运行中'
      : runtimeDetail.status.enabled
        ? '待调度'
        : '未启用'
    : '未加载';
  const runnerStatus = runtimeDetail?.runnerStatus ?? null;
  const runnerReady = runnerStatus == null ? true : Boolean(runnerStatus.ready);
  const runnerStatusReason =
    runnerStatus && typeof runnerStatus.reason === 'string' && runnerStatus.reason.trim()
      ? runnerStatus.reason.trim()
      : null;
  const runnerStatusHintVisible = runnerStatusReason
    ? isKlineStrategy || !runnerReady
    : false;
  const runnerMetricCard = (
    <div className={styles.runtimeMetric}>
      <div className={styles.runtimeMetricLabel}>执行器</div>
      <div
        className={clsx(
          styles.runtimeMetricValue,
          runnerReady ? styles.runtimeMetricPositive : styles.runtimeMetricWarning
        )}
      >
        {runnerReady ? '已就绪' : '未就绪'}
      </div>
      {runnerStatusHintVisible && runnerStatusReason ? (
        <div className={styles.runtimeMetricHint}>{runnerStatusReason}</div>
      ) : null}
    </div>
  );

  const startSymbolEdit = useCallback(() => {
    if (!strategy?.id || summarySaving || detailStatus === 'loading' || !summaryEditAllowed) {
      return;
    }
    setSummarySymbol((current) => (current ? current : baselineSummary.symbol));
    setIsEditingSymbol(true);
  }, [
    strategy?.id,
    summarySaving,
    detailStatus,
    baselineSummary.symbol,
    summaryEditAllowed
  ]);

  const handleSymbolInputChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      setSummarySymbol(event.target.value.toUpperCase());
    },
    []
  );

  const submitSummarySymbol = useCallback(async () => {
    if (!strategy?.id) {
      return;
    }
    const trimmed = summarySymbol.trim();
    const normalized = trimmed ? trimmed.toUpperCase() : '';
    const baselineUpper = baselineSummary.symbol.trim().toUpperCase();
    if (normalized === baselineUpper) {
      setSummarySymbol(baselineSummary.symbol);
      setIsEditingSymbol(false);
      return;
    }
    try {
      await dispatch(
        updateStrategySummarySettings({
          strategyId: strategy.id,
          primarySymbol: normalized ? normalized : null
        })
      ).unwrap();
      setSummarySymbol(normalized || '');
      setIsEditingSymbol(false);
    } catch {
      setSummarySymbol(normalized);
      setIsEditingSymbol(true);
    }
  }, [strategy?.id, summarySymbol, baselineSummary.symbol, dispatch]);

  const handleSymbolKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        void submitSummarySymbol();
      } else if (event.key === 'Escape') {
        event.preventDefault();
        setSummarySymbol(baselineSummary.symbol);
        setIsEditingSymbol(false);
      }
    },
    [submitSummarySymbol, baselineSummary.symbol]
  );

  const handleSymbolBlur = useCallback(() => {
    if (summarySaving) {
      return;
    }
    setSummarySymbol(baselineSummary.symbol);
    setIsEditingSymbol(false);
  }, [summarySaving, baselineSummary.symbol]);

  const summaryStatusTone = summarySaving
    ? 'info'
    : summaryFailed || detailError
      ? 'error'
      : summarySucceeded
        ? 'success'
        : !summaryEditAllowed
          ? 'info'
          : 'neutral';

  const summaryMessage =
    summarySaving
      ? '主符号保存中...'
      : summaryFailed
        ? summaryError ?? '保存主符号失败'
        : detailStatus === 'loading' && !detail
          ? '正在加载策略详情...'
          : detailError
            ? detailError
            : summarySucceeded
              ? '主符号已更新'
              : !summaryEditAllowed
                ? '策略运行中，停止后方可编辑主符号。'
                : isEditingSymbol
                  ? 'Enter 保存，Esc 取消。'
                  : '双击或点击“编辑”修改主符号。';

  const riskMessage = riskSaving
    ? '保存中...'
    : riskSaveFailed
      ? riskSaveError ?? '保存风险设置失败'
      : riskSaveSucceeded
        ? '风险设置已更新'
        : riskFailed
          ? riskError ?? '加载风险设置失败'
          : '配置策略级风险阈值以限制持仓和损失。';
  const candlesLoading = candlesStatus === 'loading';
  const candlesFailed = candlesStatus === 'failed';

  const strategyFilePath = strategy?.filePath ? strategy.filePath.trim() || null : null;
  const normalizedStrategyFilePath = useMemo(() => {
    if (!strategyFilePath) {
      return null;
    }
    const normalised = strategyFilePath.replace(/\\/g, '/');
    if (normalised.startsWith('src/')) {
      return normalised;
    }
    const stripped = normalised.replace(/^\.?\/*/, '');
    return stripped ? `${STRATEGY_FILE_BASE}/${stripped}` : STRATEGY_FILE_BASE;
  }, [strategyFilePath]);

  const resolvedPrimarySymbol =
    summarySymbol || detail?.primarySymbol || strategy?.symbol || '';

  const handleRefreshRuntime = useCallback(() => {
    if (!strategy?.id) {
      return;
    }
    void dispatch(
      loadStrategyRuntime({
        strategyId: strategy.id,
        refresh: true
      })
    );
  }, [dispatch, strategy?.id]);


  const summaryCards = useMemo(
    () =>
      KPI_CONFIG.map((item) => {
        const raw = resolveMetricValue(performanceSummary, item.keys);
        if (item.format === 'currency') {
          return { label: item.label, value: formatCurrency(raw) };
        }
        if (item.format === 'percent') {
          return { label: item.label, value: formatPercent(raw) };
        }
        if (item.format === 'duration') {
          return { label: item.label, value: formatDuration(raw) };
        }
        return { label: item.label, value: formatNumber(raw) };
      }),
    [performanceSummary]
  );

  const scheduleConfig = detail?.schedule ?? strategy?.schedule ?? null;
  const scheduleWindows = scheduleConfig?.windows ?? [];
  const scheduleTimezone =
    typeof scheduleConfig?.timezone === 'string' && scheduleConfig.timezone.trim()
      ? scheduleConfig.timezone.trim()
      : DEFAULT_SCHEDULE_TIMEZONE;
  const scheduleTimezoneNotice = scheduleConfig?.timezoneNotice ?? null;

  useEffect(() => {
    const tz = getLocalTimezone(performanceMarketTimezone ?? scheduleTimezone ?? localTimezone ?? null);
    ordersTimezoneRef.current = tz;
  }, [performanceMarketTimezone, scheduleTimezone, localTimezone]);
  const strategyDescription = detail?.description ?? strategy?.description ?? null;

  useEffect(() => {
    if (!strategy?.id) {
      setIsEditingScheduleTimezone(false);
      setScheduleTimezoneDraft(DEFAULT_SCHEDULE_TIMEZONE);
      return;
    }
    if (!isEditingScheduleTimezone) {
      setScheduleTimezoneDraft(scheduleTimezone);
    }
  }, [
    strategy?.id,
    isEditingScheduleTimezone,
    scheduleTimezone
  ]);

  useEffect(() => {
    if (isEditingScheduleTimezone && scheduleTimezoneEditorRef.current) {
      scheduleTimezoneEditorRef.current.focus();
    }
  }, [isEditingScheduleTimezone]);

  const scheduleTimezoneOptions = useMemo(
    () => getTimezoneOptions(scheduleTimezoneDraft),
    [scheduleTimezoneDraft]
  );

  const beginScheduleTimezoneEdit = useCallback(() => {
    if (!strategy?.id || !summaryEditAllowed) {
      return;
    }
    setScheduleTimezoneDraft(scheduleTimezone);
    setIsEditingScheduleTimezone(true);
  }, [
    strategy?.id,
    summaryEditAllowed,
    scheduleTimezone
  ]);

  const handleScheduleTimezoneChange = useCallback((value: string) => {
    setScheduleTimezoneDraft(value);
  }, []);

  const cancelScheduleTimezoneEdit = useCallback(() => {
    setScheduleTimezoneDraft(scheduleTimezone);
    setIsEditingScheduleTimezone(false);
  }, [scheduleTimezone]);

  const submitScheduleTimezone = useCallback(async () => {
    if (!strategy?.id) {
      return;
    }
    const trimmed = scheduleTimezoneDraft.trim();
    const normalized = trimmed || DEFAULT_SCHEDULE_TIMEZONE;
    if (normalized === scheduleTimezone) {
      setScheduleTimezoneDraft(scheduleTimezone);
      setIsEditingScheduleTimezone(false);
      return;
    }
    try {
      await dispatch(
        updateStrategySummarySettings({
          strategyId: strategy.id,
          scheduleTimezone: normalized
        })
      ).unwrap();
      setIsEditingScheduleTimezone(false);
    } catch {
      setIsEditingScheduleTimezone(true);
    }
  }, [
    strategy?.id,
    scheduleTimezoneDraft,
    scheduleTimezone,
    dispatch
  ]);

  const parameterDefinitions = useMemo(() => {
    const baseDefinitions: StrategyParameterConfig[] | null =
      detail?.parameterDefinitions ?? strategy?.parameters ?? null;
    const mergedDefinitions: StrategyParameterConfig[] = [];
    if (baseDefinitions && baseDefinitions.length) {
      mergedDefinitions.push(...baseDefinitions);
    }
    exitParameterDefinitions.forEach((definition) => {
      if (!mergedDefinitions.some((item) => item.name === definition.name)) {
        mergedDefinitions.push(definition);
      }
    });
    if (mergedDefinitions.length) {
      const resolved = mergedDefinitions.map((definition) => {
        const override =
          detailParameters && Object.prototype.hasOwnProperty.call(detailParameters, definition.name)
            ? detailParameters[definition.name]
            : undefined;
        return {
          ...definition,
          value:
            override !== undefined
              ? override
              : definition.value ?? definition.defaultValue ?? null
        };
      });
      const filteredResolved = normalizedStrategyFilePath?.endsWith('dom_strategy.py')
        ? resolved.filter((definition) => definition.name !== 'symbol')
        : resolved;
      const hasSubscriptionOnly =
        filteredResolved.length > 0 &&
        filteredResolved.every((definition) => definition.name && SUBSCRIPTION_PARAMETER_NAMES.has(definition.name));
      if (hasSubscriptionOnly && normalizedStrategyFilePath?.endsWith('dom_strategy.py')) {
        return DOM_STRUCTURE_PARAMETER_BLUEPRINTS.map((blueprint) => ({
          ...blueprint,
          value: getParameterValue(blueprint.name) ?? blueprint.defaultValue ?? null
        }));
      }
      return filteredResolved;
    }
    if (detailParameters) {
      return Object.entries(detailParameters).map(([name, value]) => ({
        name,
        label: name,
        type:
          typeof value === 'number'
            ? 'number'
            : typeof value === 'boolean'
              ? 'boolean'
              : 'string',
        value,
        defaultValue: null,
        description: null,
        options: null,
        min: null,
        max: null,
        step: null
      }));
    }
    if (normalizedStrategyFilePath?.endsWith('dom_strategy.py')) {
      return DOM_STRUCTURE_PARAMETER_BLUEPRINTS.map((blueprint) => ({
        ...blueprint,
        value: getParameterValue(blueprint.name) ?? blueprint.defaultValue ?? null
      }));
    }
    return [];
  }, [
    detail?.parameterDefinitions,
    strategy?.parameters,
    detailParameters,
    normalizedStrategyFilePath,
    getParameterValue,
    exitParameterDefinitions
  ]);

  type KlineParameterField = 'interval' | 'lookback' | 'aggregation';

  interface KlineParameterInfo {
    name: string | null;
    definition: StrategyParameterConfig | null;
    currentValue: unknown;
  }

  interface NormalizedKlineOption {
    label: string;
    value: string;
    rawValue: unknown;
  }

  const toOptionValueString = (value: unknown): string => {
    if (value === null || value === undefined) {
      return '';
    }
    if (typeof value === 'string') {
      return value;
    }
    return String(value);
  };

  const findKlineParameterInfo = useCallback(
    (candidates: string[]): KlineParameterInfo => {
      for (const name of candidates) {
        if (detailParameters && Object.prototype.hasOwnProperty.call(detailParameters, name)) {
          return {
            name,
            definition: parameterDefinitions.find((definition) => definition.name === name) ?? null,
            currentValue: detailParameters[name]
          };
        }
      }
      for (const name of candidates) {
        const definition = parameterDefinitions.find((item) => item.name === name);
        if (definition) {
          const value =
            definition.value ?? definition.defaultValue ?? null;
          return {
            name: definition.name,
            definition,
            currentValue: value
          };
        }
      }
      return { name: null, definition: null, currentValue: null };
    },
    [detailParameters, parameterDefinitions]
  );

  const buildKlineOptions = useCallback(
    (
      info: KlineParameterInfo,
      fallback: KlineOptionSource[]
    ): NormalizedKlineOption[] => {
      const optionSources:
        | Array<{ label: string; value: unknown }>
        | null = info.definition?.options?.length
        ? info.definition.options.map((option) => ({ label: option.label, value: option.value }))
        : fallback;
      const normalized: NormalizedKlineOption[] = optionSources
        ? optionSources
            .map((option) => ({
              label: option.label,
              value: toOptionValueString(option.value),
              rawValue: option.value
            }))
            .filter((option) => option.value !== '')
        : [];
      const currentValueString = toOptionValueString(info.currentValue);
      if (currentValueString) {
        const exists = normalized.some((option) => option.value === currentValueString);
        if (!exists) {
          normalized.push({
            label: currentValueString,
            value: currentValueString,
            rawValue: info.currentValue
          });
        }
      }
      return normalized.length ? normalized : [];
    },
    []
  );

  const parameterValuesAreEquivalent = useCallback((a: unknown, b: unknown): boolean => {
    return toOptionValueString(a) === toOptionValueString(b);
  }, []);

  const klineIntervalInfo = useMemo(
    () => findKlineParameterInfo(KLINE_INTERVAL_PARAMETER_NAMES),
    [findKlineParameterInfo]
  );
  const klineLookbackInfo = useMemo(
    () => findKlineParameterInfo(KLINE_LOOKBACK_PARAMETER_NAMES),
    [findKlineParameterInfo]
  );
  const klineAggregationInfo = useMemo(
    () => findKlineParameterInfo(KLINE_AGGREGATION_PARAMETER_NAMES),
    [findKlineParameterInfo]
  );

  
  interface NormalizedExitOption {
    label: string;
    value: string;
    rawValue: unknown;
  }
  const defaultExitOptions = useMemo<KlineOptionSource[]>(
    () => [
      { label: '无', value: 'none' },
      { label: '固定RR', value: 'fixed_rr' },
      { label: 'ATR', value: 'atr' },
      { label: 'Trail ATR', value: 'trailing_atr' }
    ],
    []
  );
  const findExitModeInfo = useCallback(
    (): KlineParameterInfo => {
      const NAMES_ALL = ['mode', 'exit_mode', 'exit_type', 'exit_strategy', 'strategy_exit', 'exit_method'];
      const NAMES_NO_MODE = ['exit_mode', 'exit_type', 'exit_strategy', 'strategy_exit', 'exit_method'];
      if (exitParameterDefinitions.length) {
        const alias = new Set(NAMES_ALL.map((n) => n.toLowerCase()));
        const byExitDef = exitParameterDefinitions.find((def) => alias.has(String(def.name ?? '').toLowerCase()));
        if (byExitDef && byExitDef.name) {
          const name = byExitDef.name;
          const currentValue = byExitDef.value ?? byExitDef.defaultValue ?? null;
          return { name, definition: byExitDef, currentValue };
        }
      }
      const primary = findKlineParameterInfo(NAMES_NO_MODE);
      if (primary.name) {
        return primary;
      }
      const candidates: StrategyParameterConfig[] = [];
      if (exitParameterDefinitions.length) {
        candidates.push(...exitParameterDefinitions);
      }
      if (parameterDefinitions.length) {
        candidates.push(...parameterDefinitions);
      }
      const knownValues = new Set(['none', 'fixed_rr', 'atr', 'trailing_atr', 'fixed', 'trailing', 'atr_trailing']);
      const match = candidates.find((def) => {
        const name = (def.name ?? '').toLowerCase();
        const label = (def.label ?? '').toLowerCase();
        const hasExitKeyword = name.includes('exit') || label.includes('exit') || label.includes('退出');
        const hasKnownOptions = Array.isArray(def.options) && def.options.some((opt) => {
          const v = (opt?.value as unknown);
          const s = typeof v === 'string' ? v.toLowerCase() : String(v).toLowerCase();
          return knownValues.has(s);
        });
        return hasExitKeyword || hasKnownOptions;
      });
      if (match && match.name) {
        const name = match.name;
        const currentValue = detailParameters && Object.prototype.hasOwnProperty.call(detailParameters, name)
          ? detailParameters[name]
          : match.value ?? match.defaultValue ?? null;
        return { name, definition: match, currentValue };
      }
      return { name: null, definition: null, currentValue: null };
    },
    [findKlineParameterInfo, exitParameterDefinitions, parameterDefinitions, detailParameters]
  );
  const isDomStrategy = useMemo(() => {
    const ds = (detail?.dataSource ?? strategy?.dataSource ?? '').toString().toLowerCase();
    const type = (detail?.strategyType ?? strategy?.templateId ?? '').toString().toLowerCase();
    const dsFlag = ds.includes('dom');
    const typeFlag = type.includes('dom');
    return dsFlag || typeFlag || !isKlineStrategy;
  }, [detail?.dataSource, strategy?.dataSource, detail?.strategyType, strategy?.templateId, isKlineStrategy]);

  const buildExitOptions = useCallback(
    (
      info: { definition: StrategyParameterConfig | null; currentValue: unknown },
      fallback: KlineOptionSource[]
    ): NormalizedExitOption[] => {
      const defOptions = Array.isArray(info.definition?.options)
        ? info.definition!.options.map((option) => ({ label: option.label, value: option.value }))
        : [];
      const mergedSources: Array<{ label: string; value: unknown }> = [...fallback, ...defOptions];
      const seen = new Set<string>();
      const normalized: NormalizedExitOption[] = [];
      for (const option of mergedSources) {
        const valueStr = toOptionValueString(option.value);
        if (!valueStr) continue;
        const key = valueStr.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        normalized.push({ label: option.label, value: valueStr, rawValue: option.value });
      }
      const allowed = new Set(['none', 'fixed_rr', 'atr', 'trailing_atr']);
      const filtered = normalized.filter((opt) => allowed.has(opt.value.toLowerCase()));
      const final = isDomStrategy ? filtered.filter((opt) => opt.value.toLowerCase() === 'fixed_rr') : filtered;
      const labelMap: Record<string, string> = {
        none: '无',
        fixed_rr: '固定RR',
        atr: 'ATR',
        trailing_atr: 'Trail ATR'
      };
      for (const option of final) {
        const key = option.value.toLowerCase();
        if (labelMap[key]) {
          option.label = labelMap[key];
        }
      }
      const currentValueString = toOptionValueString(info.currentValue);
      if (currentValueString) {
        const exists = final.some((option) => option.value === currentValueString);
        if (!exists && allowed.has(currentValueString.toLowerCase())) {
          const candidate = {
            label: labelMap[currentValueString.toLowerCase()] ?? currentValueString,
            value: currentValueString,
            rawValue: info.currentValue
          };
          if (!isDomStrategy || candidate.value.toLowerCase() === 'fixed_rr') {
            final.push(candidate);
          }
        }
      }
      return final.length ? final : [];
    },
    [isDomStrategy]
  );
  const exitModeInfo = useMemo(() => findExitModeInfo(), [findExitModeInfo]);
  const exitModeOptions = useMemo(
    () => buildExitOptions({ definition: exitModeInfo.definition, currentValue: exitModeInfo.currentValue }, defaultExitOptions),
    [buildExitOptions, exitModeInfo.definition, exitModeInfo.currentValue, defaultExitOptions]
  );
  const exitModeOptionMap = useMemo(() => new Map(exitModeOptions.map((o) => [o.value, o.rawValue])), [exitModeOptions]);
  const exitModeValueString = useMemo(() => toOptionValueString(exitModeInfo.currentValue), [exitModeInfo.currentValue]);
  const exitModeLabel = useMemo(() => {
    let currentValueString = exitModeValueString;
    if (isDomStrategy && currentValueString.toLowerCase() !== 'fixed_rr') {
      currentValueString = 'fixed_rr';
    }
    const match = exitModeOptions.find((o) => o.value === currentValueString);
    return match?.label ?? (currentValueString || '—');
  }, [exitModeValueString, exitModeOptions, isDomStrategy]);

  const exitSummaryFields = useMemo(() => {
    const fields: Array<{ label: string; value: string }> = [];
    const findValue = (name: string) => {
      const def = exitParameterDefinitions.find((d) => d.name === name);
      const v = def ? (def.value ?? def.defaultValue ?? null) : null;
      return toOptionValueString(v);
    };
    const pushField = (label: string, name: string) => {
      fields.push({ label, value: findValue(name) });
    };
    pushField('风险金额', 'risk_amount');
    pushField('RR 比例', 'rr_ratio');
    pushField('ATR 长度', 'atr_length');
    pushField('ATR 倍数', 'atr_multiplier');
    pushField('跟踪 ATR 倍数', 'trailing_multiplier');
    return fields;
  }, [exitParameterDefinitions]);
  const [isExitModeEditing, setIsExitModeEditing] = useState<boolean>(false);
  const [exitModeDraft, setExitModeDraft] = useState<string>('');
  const [exitModePending, setExitModePending] = useState<boolean>(false);
  const beginExitModeEdit = useCallback(() => {
    if (exitModePending) {
      return;
    }
    const currentValueString = toOptionValueString(exitModeInfo.currentValue);
    const initial = currentValueString || (exitModeOptions[0]?.value ?? '');
    setExitModeDraft(initial);
    setIsExitModeEditing(true);
  }, [exitModePending, exitModeInfo.currentValue, exitModeOptions]);
  const cancelExitModeEdit = useCallback(() => {
    setIsExitModeEditing(false);
    setExitModeDraft('');
  }, []);
  const submitExitMode = useCallback(async () => {
    if (!strategy?.id) {
      return;
    }
    if (!exitModeInfo.name) {
      dispatch(
        addToast({
          message: '未找到对应的退出方式参数名称，无法保存。',
          variant: 'error',
          preventDuplicates: true
        })
      );
      return;
    }
    const resolved = exitModeOptionMap.get(exitModeDraft) ?? exitModeDraft;
    if (isDomStrategy && String(resolved).toLowerCase() !== 'fixed_rr') {
      dispatch(
        addToast({ message: 'DOM 策略仅支持固定RR退出方式', variant: 'error', preventDuplicates: true })
      );
      return;
    }
    if (parameterValuesAreEquivalent(exitModeInfo.currentValue, resolved)) {
      setIsExitModeEditing(false);
      return;
    }
    setExitModePending(true);
    try {
      await dispatch(
        updateStrategyParameters({ strategyId: strategy.id, parameters: { [exitModeInfo.name]: resolved } })
      ).unwrap();
      setIsExitModeEditing(false);
    } catch (error) {
      const message = error instanceof Error && error.message ? error.message : '保存退出方式失败';
      dispatch(
        addToast({ message, variant: 'error', preventDuplicates: true })
      );
    } finally {
      setExitModePending(false);
    }
  }, [
    dispatch,
    exitModeInfo.name,
    exitModeInfo.currentValue,
    exitModeOptionMap,
    exitModeDraft,
    strategy?.id,
    isDomStrategy,
    parameterValuesAreEquivalent
  ]);

  const exitModeString = exitModeValueString?.toLowerCase() ?? '';
  const exitRiskAmountDef = exitParameterDefinitions.find((d) => d.name === 'risk_amount');
  const exitRrRatioDef = exitParameterDefinitions.find((d) => d.name === 'rr_ratio');
  const resolvedRiskAmount = (() => {
    const v = exitRiskAmountDef ? (exitRiskAmountDef.value ?? exitRiskAmountDef.defaultValue ?? null) : null;
    if (v === null || v === undefined || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  })();
  const resolvedRrRatio = (() => {
    const v = exitRrRatioDef ? (exitRrRatioDef.value ?? exitRrRatioDef.defaultValue ?? null) : null;
    if (v === null || v === undefined || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  })();
  const POSITION_ENTRY_PRICE_KEYS = useMemo(
    () => [
      'entry_price',
      'avg_entry_price',
      'average_entry_price',
      'avgEntryPrice',
      'averageEntryPrice',
      'position_entry_price',
      'positionEntryPrice',
      'position_avg_price',
      'positionAvgPrice',
      'average_price',
      'avg_price',
      'position_price',
      'positionPrice',
      'cost_basis',
      'costBasis'
    ],
    []
  );
  const POSITION_SIDE_KEYS = useMemo(
    () => [
      'position_side',
      'positionSide',
      'pos_side',
      'posSide',
      'side',
      'direction',
      'position_direction',
      'positionDirection'
    ],
    []
  );
  const runtimePositionSnapshots = useMemo(() => {
    const snapshots: Array<Record<string, unknown>> = [];
    const snapshot = runtimeDetail?.snapshot as Record<string, unknown> | null | undefined;
    const summary = snapshot?.summary;
    if (summary && typeof summary === 'object') {
      snapshots.push(summary as Record<string, unknown>);
    }
    const accountSnapshot = snapshot?.account_snapshot ?? snapshot?.account;
    if (accountSnapshot && typeof accountSnapshot === 'object') {
      snapshots.push(accountSnapshot as Record<string, unknown>);
    }
    const positionsSnapshot = snapshot?.positions_snapshot ?? snapshot?.positions ?? snapshot?.position;
    if (Array.isArray(positionsSnapshot)) {
      positionsSnapshot.forEach((item) => {
        if (item && typeof item === 'object') {
          snapshots.push(item as Record<string, unknown>);
        }
      });
    } else if (positionsSnapshot && typeof positionsSnapshot === 'object') {
      snapshots.push(positionsSnapshot as Record<string, unknown>);
    }
    return snapshots;
  }, [runtimeDetail?.snapshot]);
  const resolveRuntimePositionNumber = useCallback(
    (keys: string[]): number | null => {
      for (const snapshot of runtimePositionSnapshots) {
        for (const key of keys) {
          if (key in snapshot) {
            const parsed = parseFiniteNumber(snapshot[key]);
            if (parsed !== null) {
              return parsed;
            }
          }
        }
      }
      return null;
    },
    [runtimePositionSnapshots]
  );
  const resolveRuntimePositionSide = useCallback(
    (keys: string[]): 'BUY' | 'SELL' | null => {
      for (const snapshot of runtimePositionSnapshots) {
        for (const key of keys) {
          if (key in snapshot) {
            const normalized = normalizeTradeSide(snapshot[key]);
            if (normalized) {
              return normalized;
            }
          }
        }
      }
      return null;
    },
    [runtimePositionSnapshots]
  );
  const latestOrder = useMemo(() => {
    const list = ordersSnapshot?.orders ?? performance?.orders ?? [];
    return list.length ? list[0] : null;
  }, [ordersSnapshot?.orders, performance?.orders]);
  const latestEntryPrice = useMemo(() => {
    const p = latestOrder ? latestOrder.averagePrice ?? latestOrder.price ?? null : null;
    if (typeof p === 'number' && Number.isFinite(p)) {
      return p;
    }
    const runtimePrice = resolveRuntimePositionNumber(POSITION_ENTRY_PRICE_KEYS);
    return typeof runtimePrice === 'number' && Number.isFinite(runtimePrice) ? runtimePrice : null;
  }, [
    POSITION_ENTRY_PRICE_KEYS,
    latestOrder,
    resolveRuntimePositionNumber
  ]);
  const latestSide = useMemo<'BUY' | 'SELL' | null>(() => {
    if (latestOrder) {
      const s = latestOrder.side?.toString().toUpperCase();
      if (s === 'BUY' || s === 'SELL') {
        return s as 'BUY' | 'SELL';
      }
    }
    return resolveRuntimePositionSide(POSITION_SIDE_KEYS);
  }, [POSITION_SIDE_KEYS, latestOrder, resolveRuntimePositionSide]);
  const lastClose = useMemo(() => {
    const last = candlestickBars.length ? candlestickBars[candlestickBars.length - 1] : null;
    const c = last?.close ?? null;
    return typeof c === 'number' && Number.isFinite(c) ? c : null;
  }, [candlestickBars]);
  const computedFixedRrTargets = useMemo(() => {
    if (exitModeString !== 'fixed_rr') return { sl: null, tp: null };
    const computed = computeFixedRrTargets({
      entryPrice: latestEntryPrice,
      side: latestSide,
      riskAmount: resolvedRiskAmount,
      rrRatio: resolvedRrRatio
    });
    return {
      sl: computed.sl ?? primaryDomRuntimeMetrics.stopLossPrice ?? null,
      tp: computed.tp ?? primaryDomRuntimeMetrics.takeProfitPrice ?? null
    };
  }, [
    exitModeString,
    latestEntryPrice,
    latestSide,
    resolvedRiskAmount,
    resolvedRrRatio,
    primaryDomRuntimeMetrics.stopLossPrice,
    primaryDomRuntimeMetrics.takeProfitPrice
  ]);
  const exitAtrLengthDef = exitParameterDefinitions.find((d) => d.name === 'atr_length');
  const exitAtrMultiplierDef = exitParameterDefinitions.find((d) => d.name === 'atr_multiplier');
  const exitTrailingMultiplierDef = exitParameterDefinitions.find((d) => d.name === 'trailing_multiplier');
  const resolvedAtrLength = (() => {
    const v = exitAtrLengthDef ? (exitAtrLengthDef.value ?? exitAtrLengthDef.defaultValue ?? null) : null;
    const n = typeof v === 'number' ? v : v === null || v === undefined || v === '' ? 14 : Number(v);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 14;
  })();
  const resolvedAtrMultiplier = (() => {
    const v = exitAtrMultiplierDef ? (exitAtrMultiplierDef.value ?? exitAtrMultiplierDef.defaultValue ?? null) : null;
    const n = typeof v === 'number' ? v : v === null || v === undefined || v === '' ? 1 : Number(v);
    return Number.isFinite(n) && n > 0 ? n : 1;
  })();
  const resolvedTrailingMultiplier = (() => {
    const v = exitTrailingMultiplierDef ? (exitTrailingMultiplierDef.value ?? exitTrailingMultiplierDef.defaultValue ?? null) : null;
    const n = typeof v === 'number' ? v : v === null || v === undefined || v === '' ? 1.5 : Number(v);
    return Number.isFinite(n) && n > 0 ? n : 1.5;
  })();
  const computedAtrTargets = useMemo(() => {
    const mode = exitModeString;
    if (mode !== 'atr' && mode !== 'trailing_atr') {
      return {
        sl: primaryDomRuntimeMetrics.stopLossPrice ?? null,
        tp: primaryDomRuntimeMetrics.takeProfitPrice ?? null
      };
    }
    if (!latestEntryPrice || !latestSide || !candlestickBars.length) {
      return {
        sl: primaryDomRuntimeMetrics.stopLossPrice ?? null,
        tp: primaryDomRuntimeMetrics.takeProfitPrice ?? null
      };
    }
    const direction = latestSide === 'BUY' ? 1 : -1;
    const windows = candlestickBars.slice(-Math.max(resolvedAtrLength, 1));
    let prevClose: number | null = null;
    const trueRanges: number[] = [];
    for (const bar of windows) {
      const high = bar.high;
      const low = bar.low;
      const close = bar.close;
      const candidates: number[] = [Math.abs(high - low)];
      if (prevClose !== null) {
        candidates.push(Math.abs(high - prevClose));
        candidates.push(Math.abs(low - prevClose));
      }
      const tr = Math.max(...candidates);
      trueRanges.push(tr);
      prevClose = close;
    }
    if (!trueRanges.length) return { sl: null, tp: null };
    const atr = trueRanges.reduce((a, b) => a + b, 0) / trueRanges.length;
    const multiplier = mode === 'trailing_atr' ? resolvedTrailingMultiplier : resolvedAtrMultiplier;
    const anchor = mode === 'trailing_atr' ? lastClose ?? latestEntryPrice : latestEntryPrice;
    if (anchor === null) return { sl: null, tp: null };
    const atrGap = atr * multiplier;
    let sl = anchor - direction * atrGap;
    const tpGapMultiplier = resolvedRrRatio ?? 1;
    const tp = latestEntryPrice + direction * atrGap * tpGapMultiplier;
    if (mode === 'trailing_atr' && primaryDomRuntimeMetrics.stopLossPrice !== null) {
      if (direction > 0) sl = Math.max(sl, primaryDomRuntimeMetrics.stopLossPrice!);
      else sl = Math.min(sl, primaryDomRuntimeMetrics.stopLossPrice!);
    }
    return { sl, tp };
  }, [
    exitModeString,
    latestEntryPrice,
    latestSide,
    candlestickBars,
    resolvedAtrLength,
    resolvedAtrMultiplier,
    resolvedTrailingMultiplier,
    lastClose,
    primaryDomRuntimeMetrics.stopLossPrice,
    primaryDomRuntimeMetrics.takeProfitPrice,
    resolvedRrRatio
  ]);
  const effectiveStopLossPrice =
    (computedFixedRrTargets.sl ?? computedAtrTargets.sl) ?? primaryDomRuntimeMetrics.stopLossPrice;
  const effectiveTakeProfitPrice =
    (computedFixedRrTargets.tp ?? computedAtrTargets.tp) ?? primaryDomRuntimeMetrics.takeProfitPrice;

  useEffect(() => {
    if (!active || !strategy?.id) return;
    if (exitModeString !== 'atr' && exitModeString !== 'trailing_atr') return;
    if (!authToken) return;
    if (isScreenerStrategy) return;
    const symbol = candlesSymbol ?? detail?.primarySymbol ?? strategy?.symbol ?? null;
    if (!symbol) return;
    const payload: MarketSubscriptionStartPayload = { symbol, enableTicker: true, enableBars: true };
    if (clientId) payload.ownerId = `ws:${clientId}`;
    void startMarketSubscription(authToken, payload).catch(() => {});
    const { symbol: secondarySymbol, hasIntervals } = getSecondarySubscription();
    if (
      secondarySymbol &&
      hasIntervals &&
      secondarySymbol.trim() &&
      secondarySymbol.trim() !== symbol
    ) {
      const secondaryPayload: MarketSubscriptionStartPayload = {
        symbol: secondarySymbol.trim(),
        enableTicker: true,
        enableBars: true
      };
      if (clientId) secondaryPayload.ownerId = `ws:${clientId}`;
      void startMarketSubscription(authToken, secondaryPayload).catch(() => {});
    }
  }, [
    strategy?.id,
    exitModeString,
    authToken,
    clientId,
    candlesSymbol,
    detail?.primarySymbol,
    strategy?.symbol,
    isScreenerStrategy,
    active,
    getSecondarySubscription
  ]);

  useEffect(() => {
    if (!active || !strategy?.id) return;
    if (exitModeString !== 'atr' && exitModeString !== 'trailing_atr') return;
    if (candlestickBars.length) return;
    if (isScreenerStrategy) return;
    void dispatch(
      loadStrategyCandles({ strategyId: strategy.id, interval: resolvedCandlesInterval ?? '5m' })
    );
  }, [dispatch, strategy?.id, exitModeString, candlestickBars.length, resolvedCandlesInterval, isScreenerStrategy, active]);

  const klineIntervalOptions = useMemo(
    () => buildKlineOptions(klineIntervalInfo, DEFAULT_KLINE_INTERVAL_OPTIONS),
    [buildKlineOptions, klineIntervalInfo]
  );
  const klineLookbackOptions = useMemo(
    () => buildKlineOptions(klineLookbackInfo, DEFAULT_KLINE_LOOKBACK_OPTIONS),
    [buildKlineOptions, klineLookbackInfo]
  );
  const klineAggregationOptions = useMemo(
    () => buildKlineOptions(klineAggregationInfo, DEFAULT_KLINE_AGGREGATION_OPTIONS),
    [buildKlineOptions, klineAggregationInfo]
  );

  const klineIntervalOptionMap = useMemo(() => {
    return new Map<string, unknown>(klineIntervalOptions.map((option) => [option.value, option.rawValue]));
  }, [klineIntervalOptions]);
  const klineLookbackOptionMap = useMemo(() => {
    return new Map<string, unknown>(klineLookbackOptions.map((option) => [option.value, option.rawValue]));
  }, [klineLookbackOptions]);
  const klineAggregationOptionMap = useMemo(() => {
    return new Map<string, unknown>(
      klineAggregationOptions.map((option) => [option.value, option.rawValue])
    );
  }, [klineAggregationOptions]);

  const [klineEditingState, setKlineEditingState] = useState<{
    field: KlineParameterField;
    value: string;
  } | null>(null);
  const [klinePendingField, setKlinePendingField] = useState<KlineParameterField | null>(null);

  useEffect(() => {
    setKlineEditingState(null);
    setKlinePendingField(null);
  }, [strategy?.id]);

  const getKlineInfo = useCallback(
    (field: KlineParameterField): {
      info: KlineParameterInfo;
      options: NormalizedKlineOption[];
      optionMap: Map<string, unknown>;
    } => {
      switch (field) {
        case 'interval':
          return {
            info: klineIntervalInfo,
            options: klineIntervalOptions,
            optionMap: klineIntervalOptionMap
          };
        case 'lookback':
          return {
            info: klineLookbackInfo,
            options: klineLookbackOptions,
            optionMap: klineLookbackOptionMap
          };
        case 'aggregation':
        default:
          return {
            info: klineAggregationInfo,
            options: klineAggregationOptions,
            optionMap: klineAggregationOptionMap
          };
      }
    },
    [
      klineAggregationInfo,
      klineAggregationOptionMap,
      klineAggregationOptions,
      klineIntervalInfo,
      klineIntervalOptionMap,
      klineIntervalOptions,
      klineLookbackInfo,
      klineLookbackOptionMap,
      klineLookbackOptions
    ]
  );

  const beginKlineParameterEdit = useCallback(
    (field: KlineParameterField) => {
      if (klinePendingField) {
        return;
      }
      const { info, options } = getKlineInfo(field);
      if (!info.name) {
        dispatch(
          addToast({
            message: '暂时无法识别该参数的实际配置项，无法编辑。',
            variant: 'error',
            preventDuplicates: true
          })
        );
        return;
      }
      if (!options.length) {
        dispatch(
          addToast({
            message: '该参数暂无可选项。',
            variant: 'error',
            preventDuplicates: true
          })
        );
        return;
      }
      setKlineEditingState({
        field,
        value:
          klineEditingState?.field === field && klineEditingState.value
            ? klineEditingState.value
            : (() => {
                const currentValueString = toOptionValueString(info.currentValue);
                if (currentValueString) {
                  return options.some((option) => option.value === currentValueString)
                    ? currentValueString
                    : options[0]!.value;
                }
                return options[0]!.value;
              })()
      });
    },
    [dispatch, getKlineInfo, klineEditingState, klinePendingField]
  );

  const cancelKlineParameterEdit = useCallback(
    (field: KlineParameterField) => {
      setKlineEditingState((previous) => {
        if (!previous || previous.field !== field) {
          return previous;
        }
        if (klinePendingField === field) {
          return previous;
        }
        return null;
      });
    },
    [klinePendingField]
  );

  const changeKlineParameterDraft = useCallback((field: KlineParameterField, value: string) => {
    setKlineEditingState((previous) => {
      if (!previous || previous.field !== field) {
        return previous;
      }
      return { ...previous, value };
    });
  }, []);

  const submitKlineParameter = useCallback(
    async (field: KlineParameterField) => {
      if (!strategy?.id) {
        return;
      }
      const editing = klineEditingState;
      if (!editing || editing.field !== field) {
        return;
      }
      const { info, optionMap } = getKlineInfo(field);
      if (!info.name) {
        dispatch(
          addToast({
            message: '未找到对应的参数名称，无法保存。',
            variant: 'error',
            preventDuplicates: true
          })
        );
        return;
      }
      const resolvedValue = optionMap.get(editing.value) ?? editing.value;
      if (parameterValuesAreEquivalent(info.currentValue, resolvedValue)) {
        setKlineEditingState(null);
        return;
      }
      setKlinePendingField(field);
      try {
        await dispatch(
          updateStrategyParameters({
            strategyId: strategy.id,
            parameters: { [info.name]: resolvedValue }
          })
        ).unwrap();
        setKlineEditingState(null);
      } catch (error) {
        const message =
          error instanceof Error && error.message
            ? error.message
            : '保存参数失败';
        dispatch(
          addToast({
            message,
            variant: 'error',
            preventDuplicates: true
          })
        );
      } finally {
        setKlinePendingField(null);
      }
    },
    [dispatch, getKlineInfo, klineEditingState, strategy?.id, parameterValuesAreEquivalent]
  );

  const resolveParameterValue = (names: string[]): string | null => {
    for (const name of names) {
      const value = getParameterValue(name);
      if (typeof value === 'string') {
        const trimmed = value.trim();
        if (trimmed) {
          return trimmed;
        }
      }
    }
    return null;
  };

  const klineIntervalLabel = resolveParameterValue([
    'timeframe',
    'bar_interval',
    'barInterval',
    'interval',
    'time_frame'
  ]);
  const klineLookbackLabel = resolveParameterValue([
    'lookback',
    'lookback_window',
    'window',
    'history'
  ]);
  const klineAggregationLabel = resolveParameterValue([
    'aggregation',
    'aggregation_window',
    'bars_per_aggregation',
    'batch_size'
  ]);

  const klineIntervalSelectOptions = useMemo(
    () => klineIntervalOptions.map((option) => ({ label: option.label, value: option.value })),
    [klineIntervalOptions]
  );
  const klineLookbackSelectOptions = useMemo(
    () => klineLookbackOptions.map((option) => ({ label: option.label, value: option.value })),
    [klineLookbackOptions]
  );
  const klineAggregationSelectOptions = useMemo(
    () => klineAggregationOptions.map((option) => ({ label: option.label, value: option.value })),
    [klineAggregationOptions]
  );

  const klineIntervalSelectValue =
    klineEditingState?.field === 'interval'
      ? klineEditingState.value
      : toOptionValueString(klineIntervalInfo.currentValue);
  const klineLookbackSelectValue =
    klineEditingState?.field === 'lookback'
      ? klineEditingState.value
      : toOptionValueString(klineLookbackInfo.currentValue);
  const klineAggregationSelectValue =
    klineEditingState?.field === 'aggregation'
      ? klineEditingState.value
      : toOptionValueString(klineAggregationInfo.currentValue);

  const canEditKlineInterval = Boolean(strategy?.id && klineIntervalInfo.name);
  const canEditKlineLookback = Boolean(strategy?.id && klineLookbackInfo.name);
  const canEditKlineAggregation = Boolean(strategy?.id && klineAggregationInfo.name);

  const parameterCount = parameterDefinitions.length;

  const beginParameterEdit = (definition: StrategyParameterConfig) => {
    if (!definition?.name) {
      return;
    }
    if (parameterStatus === 'loading' && pendingParameter) {
      return;
    }
    const currentValue = detail?.parameters?.[definition.name] ?? definition.value ?? null;
    if (definition.name === 'volatility_regime_multipliers') {
      setEditingParameter(null);
      setEditingDraftValue('');
      setParameterInlineError(null);
      setParameterBanner(null);
      parameterEditorRef.current = null;
      setVolatilityEditorState({
        open: true,
        definition,
        initialValue: extractRegimeMultiplierValues(currentValue),
        error: null
      });
      return;
    }
    if (definition.name === 'disabled_regimes') {
      setEditingParameter(null);
      setEditingDraftValue('');
      setParameterInlineError(null);
      setParameterBanner(null);
      parameterEditorRef.current = null;
      setDisabledRegimesEditorState({
        open: true,
        definition,
        initialValue: extractDisabledRegimeValues(currentValue),
        error: null
      });
      return;
    }
    setEditingParameter(definition.name);
    let initial = toParameterInputString(definition.value ?? null);
    // Percent-aware editing for pressure thresholds when relative imbalance is enabled
    const relativeImbalanceEnabled = (getParameterValue('use_relative_imbalance') ?? '')
      .trim()
      .toLowerCase() === 'true';
    const isPressureThresholdParam = definition.name === 'pressure_threshold';
    if (relativeImbalanceEnabled && isPressureThresholdParam) {
      const numeric = typeof definition.value === 'number' ? definition.value : null;
      if (numeric !== null && Number.isFinite(numeric) && numeric <= 1) {
        initial = String(numeric * 100);
      }
    }
    setEditingDraftValue(initial);
    setParameterInlineError(null);
    setParameterBanner(null);
    parameterEditorRef.current = null;
  };

  const cancelParameterEdit = () => {
    setEditingParameter(null);
    setEditingDraftValue('');
    setParameterInlineError(null);
    setPendingParameter(null);
    parameterEditorRef.current = null;
  };

  const handleParameterBlur = (name: string) => {
    if (pendingParameter === name && parameterStatus === 'loading') {
      return;
    }
    cancelParameterEdit();
  };

  const handleParameterInputChange = (event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setEditingDraftValue(event.target.value);
  };

  const handleParameterInputKeyDown = (
    event: KeyboardEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      void handleParameterSubmit();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      cancelParameterEdit();
    }
  };

  const handleParameterSubmit = async () => {
    if (!strategy?.id || !editingParameter) {
      return;
    }
    const definition = parameterDefinitions.find((item) => item.name === editingParameter);
    if (!definition) {
      setParameterInlineError('无法找到参数定义');
      return;
    }
    try {
      const isExitModeParam = (() => {
        const name = (definition.name ?? '').toLowerCase();
        return ['mode', 'exit_mode', 'exit_type', 'exit_strategy', 'strategy_exit', 'exit_method'].includes(name);
      })();
      const parsed = (() => {
        if (isExitModeParam) {
          const options = buildExitOptions({ definition, currentValue: definition.value ?? null }, defaultExitOptions);
          const draft = editingDraftValue.trim().toLowerCase();
          if (isDomStrategy && draft !== 'fixed_rr') {
            throw new Error('DOM 策略仅支持固定RR退出方式');
          }
          const match = options.find((opt) => opt.value === draft);
          if (!match) {
            throw new Error('请选择列表中的有效值');
          }
          return match.rawValue;
        }
        return parseParameterInputValue(definition, editingDraftValue);
      })();
      // Percent-aware submission: convert percent to ratio for pressure thresholds when relative mode is enabled
      const relativeImbalanceEnabled = (getParameterValue('use_relative_imbalance') ?? '')
        .trim()
        .toLowerCase() === 'true';
                                const isPressureThresholdParam = definition.name === 'pressure_threshold';
      const resolvedValue =
        relativeImbalanceEnabled && isPressureThresholdParam && typeof parsed === 'number'
          ? parsed / 100
          : parsed;
      if (parameterValuesAreEqual(resolvedValue, definition.value ?? null)) {
        cancelParameterEdit();
        return;
      }
      lastSubmittedParameterRef.current = {
        name: definition.name,
        label: definition.label ?? definition.name
      };
      setPendingParameter(editingParameter);
      setParameterInlineError(null);
      await dispatch(
        updateStrategyParameters({
          strategyId: strategy.id,
          parameters: { [definition.name]: resolvedValue }
        })
      ).unwrap();
      cancelParameterEdit();
    } catch (error) {
      setPendingParameter(null);
      if (error instanceof Error && error.message) {
        setParameterInlineError(error.message);
      } else {
        setParameterInlineError('保存参数失败');
      }
    }
  };

  const closeVolatilityEditor = () => {
    setVolatilityEditorState({ open: false, definition: null, initialValue: {}, error: null });
  };

  const closeDisabledRegimesEditor = () => {
    setDisabledRegimesEditorState({ open: false, definition: null, initialValue: [], error: null });
  };

  const handleVolatilityModalSubmit = async (values: RegimeMultiplierPayload) => {
    if (!strategy?.id || !volatilityEditorState.definition?.name) {
      return;
    }
    const { definition } = volatilityEditorState;
    const parameterName = definition.name;
    const baselineValue = detail?.parameters?.[parameterName] ?? definition.value ?? null;
    const baseline = extractRegimeMultiplierValues(baselineValue);
    const unchanged = REGIME_KEYS.every((key) => {
      const baselineValueForKey = baseline[key];
      if (baselineValueForKey === undefined) {
        return false;
      }
      return parameterValuesAreEqual(baselineValueForKey, values[key]);
    });
    if (unchanged) {
      closeVolatilityEditor();
      return;
    }
    lastSubmittedParameterRef.current = {
      name: parameterName,
      label: definition.label ?? parameterName
    };
    setPendingParameter(parameterName);
    setVolatilityEditorState((prev) => ({ ...prev, error: null }));
    try {
      await dispatch(
        updateStrategyParameters({
          strategyId: strategy.id,
          parameters: { [parameterName]: values }
        })
      ).unwrap();
      setPendingParameter(null);
      closeVolatilityEditor();
    } catch (error) {
      setPendingParameter(null);
      const message =
        error instanceof Error && error.message ? error.message : '保存参数失败';
      setVolatilityEditorState((prev) => ({ ...prev, error: message }));
    }
  };

  const handleDisabledRegimesModalSubmit = async (values: string[]) => {
    if (!strategy?.id || !disabledRegimesEditorState.definition?.name) {
      return;
    }
    const { definition } = disabledRegimesEditorState;
    const parameterName = definition.name;
    const normalizedValues = values
      .map((value) => value.toLowerCase())
      .filter((value): value is RegimeKey => REGIME_KEYS.includes(value as RegimeKey));
    const baselineValue = detail?.parameters?.[parameterName] ?? definition.value ?? null;
    const baseline = extractDisabledRegimeValues(baselineValue);
    const sortedBaseline = [...baseline].sort();
    const sortedNext = [...normalizedValues].sort();
    const unchanged =
      sortedBaseline.length === sortedNext.length &&
      sortedBaseline.every((value, index) => value === sortedNext[index]);
    if (unchanged) {
      closeDisabledRegimesEditor();
      return;
    }
    lastSubmittedParameterRef.current = {
      name: parameterName,
      label: definition.label ?? parameterName
    };
    setPendingParameter(parameterName);
    setDisabledRegimesEditorState((prev) => ({ ...prev, error: null }));
    try {
      await dispatch(
        updateStrategyParameters({
          strategyId: strategy.id,
          parameters: { [parameterName]: normalizedValues }
        })
      ).unwrap();
      setPendingParameter(null);
      closeDisabledRegimesEditor();
    } catch (error) {
      setPendingParameter(null);
      const message =
        error instanceof Error && error.message ? error.message : '保存参数失败';
      setDisabledRegimesEditorState((prev) => ({ ...prev, error: message }));
    }
  };

  useEffect(() => {
    if (!editingParameter) {
      parameterEditorRef.current = null;
      return;
    }
    const node = parameterEditorRef.current;
    if (!node) {
      return;
    }
    if (typeof node.focus === 'function') {
      node.focus();
    }
    if ('select' in node && typeof node.select === 'function') {
      (node as HTMLInputElement | HTMLTextAreaElement).select();
    }
  }, [editingParameter]);

  useEffect(() => {
    const previousStatus = previousParameterStatusRef.current;
    if (parameterStatus === 'idle') {
      if (!pendingParameter) {
        setParameterBanner(null);
      }
    } else if (parameterStatus === 'loading' && pendingParameter) {
      setParameterBanner({ tone: 'info', text: '保存参数中...' });
    } else if (parameterStatus === 'succeeded') {
      setParameterBanner({ tone: 'success', text: '参数已保存' });
    } else if (parameterStatus === 'failed') {
      setParameterBanner({ tone: 'error', text: parameterError ?? '更新策略参数失败' });
    }
    if (parameterStatus !== previousStatus) {
      if (parameterStatus === 'succeeded' && lastSubmittedParameterRef.current) {
        const { label } = lastSubmittedParameterRef.current;
        dispatch(
          addToast({
            message: `已保存参数「${label}」`,
            variant: 'success',
            preventDuplicates: true
          })
        );
        lastSubmittedParameterRef.current = null;
      } else if (parameterStatus === 'failed' && lastSubmittedParameterRef.current) {
        const { label } = lastSubmittedParameterRef.current;
        const errorDetail = parameterError?.trim();
        const baseMessage = `保存参数「${label}」失败`;
        dispatch(
          addToast({
            message: errorDetail ? `${baseMessage}：${errorDetail}` : baseMessage,
            variant: 'error',
            preventDuplicates: true
          })
        );
        lastSubmittedParameterRef.current = null;
      }
    }
    previousParameterStatusRef.current = parameterStatus;
  }, [parameterStatus, parameterError, pendingParameter, dispatch]);

  const renderParameterEditor = (
    definition: StrategyParameterConfig,
    isSaving: boolean
  ): JSX.Element => {
    const normalizedType = normalizeParameterType(definition);

    const isExitModeParam = (() => {
      const name = (definition.name ?? '').toLowerCase();
      return ['mode', 'exit_mode', 'exit_type', 'exit_strategy', 'strategy_exit', 'exit_method'].includes(name);
    })();

    if (isExitModeParam) {
      const options = buildExitOptions({ definition, currentValue: definition.value ?? null }, defaultExitOptions);
      const value = editingDraftValue || '';
      return (
        <select
          ref={(node) => {
            parameterEditorRef.current = node;
          }}
          className={styles.parameterEditorControl}
          value={value}
          onChange={handleParameterInputChange}
          onBlur={() => handleParameterBlur(definition.name)}
          onKeyDown={handleParameterInputKeyDown}
          disabled={isSaving}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      );
    }

    if (definition.options && definition.options.length) {
      const value = editingDraftValue || '';
      return (
        <select
          ref={(node) => {
            parameterEditorRef.current = node;
          }}
          className={styles.parameterEditorControl}
          value={value}
          onChange={handleParameterInputChange}
          onBlur={() => handleParameterBlur(definition.name)}
          onKeyDown={handleParameterInputKeyDown}
          disabled={isSaving}
        >
          {definition.options.map((option) => {
            const optionValue = optionValueToString(option.value);
            return (
              <option key={optionValue} value={optionValue}>
                {option.label}
              </option>
            );
          })}
        </select>
      );
    }

    if (normalizedType.includes('bool')) {
      const value = editingDraftValue || '';
      return (
        <select
          ref={(node) => {
            parameterEditorRef.current = node;
          }}
          className={styles.parameterEditorControl}
          value={value}
          onChange={handleParameterInputChange}
          onBlur={() => handleParameterBlur(definition.name)}
          onKeyDown={handleParameterInputKeyDown}
          disabled={isSaving}
        >
          <option value="true">True</option>
          <option value="false">False</option>
        </select>
      );
    }

    const isNumeric =
      normalizedType.includes('int') ||
      normalizedType.includes('float') ||
      normalizedType.includes('decimal') ||
      normalizedType.includes('number');

    const inputProps: Record<string, string | number | undefined> = {};
    if (isNumeric) {
      inputProps.type = 'number';
      // Percent-aware input bounds for pressure thresholds under relative imbalance mode
      const relativeImbalanceEnabled = (getParameterValue('use_relative_imbalance') ?? '')
        .trim()
        .toLowerCase() === 'true';
      const isPressureThresholdParam = definition.name === 'pressure_threshold';
      if (typeof definition.min === 'number') {
        inputProps.min = relativeImbalanceEnabled && isPressureThresholdParam
          ? Math.max(0, definition.min * 100)
          : definition.min;
      }
      if (typeof definition.max === 'number') {
        inputProps.max = relativeImbalanceEnabled && isPressureThresholdParam
          ? definition.max * 100
          : definition.max;
      } else if (relativeImbalanceEnabled && isPressureThresholdParam) {
        // Default to 0-100% when editing percent-based thresholds
        inputProps.max = 100;
      }
      if (typeof definition.step === 'number') {
        inputProps.step = relativeImbalanceEnabled && isPressureThresholdParam
          ? Math.max(0.0001, definition.step * 100)
          : definition.step;
      } else {
        inputProps.step = relativeImbalanceEnabled && isPressureThresholdParam ? 0.01 : 'any';
      }
    } else {
      inputProps.type = 'text';
    }

    return (
      <input
        ref={(node) => {
          parameterEditorRef.current = node;
        }}
        className={styles.parameterEditorControl}
        value={editingDraftValue}
        onChange={handleParameterInputChange}
        onBlur={() => handleParameterBlur(definition.name)}
        onKeyDown={handleParameterInputKeyDown}
        disabled={isSaving}
        {...inputProps}
      />
    );
  };

  return (
    <div className={styles.panel}>
      <header
        className={clsx(styles.panelHeader, headerExpanded && styles.panelHeaderExpanded)}
      >
        <div className={styles.headerMeta}>
          <div className={styles.metaGrid}>
            <div className={styles.metaItem}>
              <span className={styles.metaLabel}>Template</span>
              <span className={styles.metaValue}>{resolvedTemplate ?? '—'}</span>
            </div>
            <div className={styles.metaItem}>
              <span className={styles.metaLabel}>Trades</span>
              <span className={styles.metaValue}>{formatNumber(totalTrades, 0)}</span>
            </div>
            <div className={styles.metaItem}>
              <span className={styles.metaLabel}>Data Source</span>
              <span className={styles.metaValue}>{resolvedDataSourceLabel}</span>
            </div>
            <div className={styles.metaItem}>
              <span className={styles.metaLabel}>Total Triggers</span>
              <span className={styles.metaValue}>
                {formatNumber(totalTriggers, 0)}
              </span>
            </div>
            <div className={styles.metaItem}>
              <span className={styles.metaLabel}>Last Triggered</span>
              <span className={styles.metaValue}>
                {formatTimestamp(lastTriggered, { timezone: getLocalTimezone(null), assumeLocalWhenNoZone: true })}
              </span>
            </div>
          </div>
        </div>
        {headerExpanded ? (
          <div className={styles.headerLogsContainer}>
            <div className={styles.headerLogsTitleRow}>
              <div className={styles.headerLogsTitle}>运行日志预览</div>
              <div className={styles.headerLogsMeta}>
                {runtimeLoading
                  ? '刷新中…'
                  : runtimeRefreshedAt
                    ? `最近更新：${formatTimestamp(runtimeRefreshedAt, { timezone: getLocalTimezone(null), assumeLocalWhenNoZone: true })}`
                    : '等待刷新'}
              </div>
            </div>
            <div className={styles.headerLogsGrid}>
              {headerLogColumns.map((column) => (
                <div key={column.key} className={styles.headerLogColumn}>
                  <div className={styles.headerLogColumnTitle}>{column.title}</div>
                  {column.logs.length ? (
                    <ul className={styles.runtimeLogList}>
                      {column.logs.map((log: RuntimeLogEntry, index: number) => {
                        const logKey = `${column.key}-${log.id}-${index}`;
                        const toneClassName =
                          RUNTIME_LOG_LEVEL_CLASS[log.tone] ?? styles.runtimeLogLevelInfo;
                        return (
                          <li key={logKey} className={styles.runtimeLogItem}>
                            <div className={styles.runtimeLogHeader}>
                              <span
                                className={clsx(styles.runtimeLogLevel, toneClassName)}
                              >
                                {log.level}
                              </span>
                              {log.timestamp ? (
                                <span className={styles.runtimeLogTimestamp}>
                                  {log.timestamp}
                                </span>
                              ) : null}
                            </div>
                            <div className={styles.runtimeLogMessage}>{log.message || '—'}</div>
                          </li>
                        );
                      })}
                    </ul>
                  ) : (
                    <div className={styles.headerLogEmpty}>{column.empty}</div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </header>

      {!isScreenerStrategy ? (
        <>
          <div className={styles.kpiGrid}>
            {summaryCards.map((card) => (
              <div key={card.label} className={styles.kpiCard}>
                <span className={styles.kpiLabel}>{card.label}</span>
                <span className={styles.kpiValue}>{card.value}</span>
              </div>
            ))}
          </div>

          <div className={styles.performanceMeta}>
            <span>数据来源：{performance?.updatedAt ? '实时统计' : '—'}</span>
            <span>
              更新时间：
              {formatTimestamp(
                performance?.updatedAt ?? metricsUpdatedAt ?? metricsLastUpdatedAt
              )}
            </span>
          </div>
        </>
      ) : null}

      {fallbackMode === 'http-polling' ? (
        <div className={styles.notice}>已进入 HTTP 轮询模式，数据刷新频率可能降低。</div>
      ) : null}

      {!isScreenerStrategy ? (
        <nav className={styles.tabNav}>
          <button
            type="button"
            className={activeTab === 'summary' ? styles.activeTab : styles.tabButton}
            onClick={() => setActiveTab('summary')}
          >
            Summary
          </button>
          <button
            type="button"
            className={activeTab === 'risk' ? styles.activeTab : styles.tabButton}
            onClick={() => setActiveTab('risk')}
          >
            Risk Control Settings
          </button>
          <button
            type="button"
            className={activeTab === 'orders' ? styles.activeTab : styles.tabButton}
            onClick={() => setActiveTab('orders')}
          >
            Orders &amp; PnL
          </button>
          <button
            type="button"
            className={activeTab === 'visual' ? styles.activeTab : styles.tabButton}
            onClick={() => setActiveTab('visual')}
          >
            Visual Metrics
          </button>
          <button
            type="button"
            className={activeTab === 'candles' ? styles.activeTab : styles.tabButton}
            onClick={() => setActiveTab('candles')}
          >
            Strategy Candles
          </button>
          <button
            type="button"
            className={activeTab === 'calendar' ? styles.activeTab : styles.tabButton}
            onClick={() => setActiveTab('calendar')}
          >
            PnL Calendar
          </button>
        </nav>
      ) : null}

      <section className={styles.tabPanel}>
        {isScreenerStrategy ? (
          strategy?.id ? (
            <ScreenerDetailPanel strategy={strategy} detail={detail ?? null} />
          ) : (
            <div className={styles.statusMessage}>暂无可用的筛选策略。</div>
          )
        ) : null}
        {!isScreenerStrategy && activeTab === 'summary' ? (
          <div className={styles.summaryGrid}>
            <div className={styles.summaryColumn}>
              {summaryMode === 'kline' ? (
                <KlineSummarySection
                  summarySymbol={summarySymbol}
                  resolvedSymbol={resolvedPrimarySymbol}
                  isEditing={isEditingSymbol}
                  summarySaving={summarySaving}
                  summaryMessage={summaryMessage}
                  summaryTone={summaryStatusTone}
                  onStartEdit={startSymbolEdit}
                  onSymbolChange={handleSymbolInputChange}
                  onSymbolBlur={handleSymbolBlur}
                  onSymbolKeyDown={handleSymbolKeyDown}
                  symbolEditorRef={symbolEditorRef}
                  canEditSymbol={summaryEditAllowed}
                  scheduleWindows={scheduleWindows}
                  timezone={scheduleTimezone}
                  timezoneNotice={scheduleTimezoneNotice}
                  timezoneOptions={scheduleTimezoneOptions}
                  timezoneDraft={scheduleTimezoneDraft}
                  isTimezoneEditing={isEditingScheduleTimezone}
                  timezoneDisabled={summarySaving}
                  canEditTimezone={summaryEditAllowed}
                  onTimezoneStartEdit={beginScheduleTimezoneEdit}
                  onTimezoneChange={handleScheduleTimezoneChange}
                  onTimezoneSave={() => {
                    void submitScheduleTimezone();
                  }}
                  onTimezoneCancel={cancelScheduleTimezoneEdit}
                  timezoneSelectRef={scheduleTimezoneEditorRef}
                  description={strategyDescription ?? '暂无描述'}
                  dataSourceLabel={resolvedDataSourceLabel ?? 'Market Data Feed'}
                  intervalLabel={klineIntervalLabel}
                  lookbackLabel={klineLookbackLabel}
                  aggregationLabel={klineAggregationLabel}
                  intervalOptions={klineIntervalSelectOptions}
                  lookbackOptions={klineLookbackSelectOptions}
                  aggregationOptions={klineAggregationSelectOptions}
                  intervalValue={klineIntervalSelectValue}
                  lookbackValue={klineLookbackSelectValue}
                  aggregationValue={klineAggregationSelectValue}
                  isIntervalEditing={klineEditingState?.field === 'interval'}
                  isLookbackEditing={klineEditingState?.field === 'lookback'}
                  isAggregationEditing={klineEditingState?.field === 'aggregation'}
                  intervalDisabled={klinePendingField === 'interval'}
                  lookbackDisabled={klinePendingField === 'lookback'}
                  aggregationDisabled={klinePendingField === 'aggregation'}
                  onIntervalStartEdit={() => beginKlineParameterEdit('interval')}
                  onLookbackStartEdit={() => beginKlineParameterEdit('lookback')}
                  onAggregationStartEdit={() => beginKlineParameterEdit('aggregation')}
                  onIntervalChange={(value) => changeKlineParameterDraft('interval', value)}
                  onLookbackChange={(value) => changeKlineParameterDraft('lookback', value)}
                  onAggregationChange={(value) => changeKlineParameterDraft('aggregation', value)}
                  onIntervalSave={() => {
                    void submitKlineParameter('interval');
                  }}
                  onLookbackSave={() => {
                    void submitKlineParameter('lookback');
                  }}
                  onAggregationSave={() => {
                    void submitKlineParameter('aggregation');
                  }}
                  onIntervalCancel={() => cancelKlineParameterEdit('interval')}
                  onLookbackCancel={() => cancelKlineParameterEdit('lookback')}
                  onAggregationCancel={() => cancelKlineParameterEdit('aggregation')}
                  canEditInterval={canEditKlineInterval}
                  canEditLookback={canEditKlineLookback}
                  canEditAggregation={canEditKlineAggregation}
                  placeholder="例如：MNQ"
                  exitModeLabel={exitModeLabel}
                  exitModeOptions={exitModeOptions.map((o) => ({ label: o.label, value: o.value }))}
                  exitModeValue={(() => {
                    if (isExitModeEditing) {
                      return exitModeDraft;
                    }
                    const value = toOptionValueString(exitModeInfo.currentValue);
                    return isDomStrategy && value.toLowerCase() !== 'fixed_rr' ? 'fixed_rr' : value;
                  })()}
                  isExitModeEditing={isExitModeEditing}
                  exitModeDisabled={exitModePending || summarySaving}
                  canEditExitMode={summaryEditAllowed}
                  onExitModeStartEdit={beginExitModeEdit}
                  onExitModeChange={(value) => setExitModeDraft(value)}
                  onExitModeSave={() => { void submitExitMode(); }}
                  onExitModeCancel={cancelExitModeEdit}
                  extraFields={exitSummaryFields}
                />
              ) : (
                <div className={styles.sectionCard}>
                    <div className={styles.sectionHeader}>Strategy Overview</div>
                    <div className={styles.detailGrid}>
                      <div>
                        <div className={styles.detailLabel}>Primary Symbol</div>
                        <div className={styles.detailValueRow}>
                        <div
                          className={clsx(
                            styles.detailValue,
                            styles.detailValueEditable,
                            isEditingSymbol && styles.detailValueEditing,
                            !summaryEditAllowed && styles.detailValueLocked
                          )}
                          onDoubleClick={summaryEditAllowed ? startSymbolEdit : undefined}
                        >
                          {isEditingSymbol ? (
                            <input
                              ref={symbolEditorRef}
                              className={styles.detailInlineInput}
                              value={summarySymbol}
                              onChange={handleSymbolInputChange}
                              onKeyDown={handleSymbolKeyDown}
                              onBlur={handleSymbolBlur}
                              disabled={summarySaving || !summaryEditAllowed}
                              placeholder="例如：MNQ"
                            />
                          ) : (
                            (resolvedPrimarySymbol && resolvedPrimarySymbol.trim()) || '—'
                          )}
                        </div>
                        <button
                          type="button"
                          className={styles.detailEditButton}
                          onClick={startSymbolEdit}
                          disabled={
                            summarySaving || isEditingSymbol || !strategy?.id || !summaryEditAllowed
                          }
                          aria-label="编辑主符号"
                        >
                          编辑
                        </button>
                      </div>
                      </div>
                      <div>
                        <div className={styles.detailLabel}>退出方式</div>
                        <div className={styles.detailValueRow}>
                          <div
                            className={clsx(
                              styles.detailValue,
                              styles.detailValueEditable,
                              isExitModeEditing && styles.detailValueEditing,
                              !summaryEditAllowed && styles.detailValueLocked
                            )}
                            onDoubleClick={summaryEditAllowed ? beginExitModeEdit : undefined}
                          >
                            {isExitModeEditing ? (
                              <select
                                className={styles.detailInlineInput}
                                value={exitModeDraft}
                                onChange={(e) => setExitModeDraft(e.target.value)}
                                disabled={exitModePending || !strategy?.id}
                                aria-label="退出方式"
                              >
                                {exitModeOptions.map((opt) => (
                                  <option key={opt.value} value={opt.value}>
                                    {opt.label}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              exitModeLabel
                            )}
                          </div>
                          <button
                            type="button"
                            className={styles.detailEditButton}
                            onClick={beginExitModeEdit}
                            disabled={exitModePending || isExitModeEditing || !strategy?.id || !summaryEditAllowed}
                            aria-label="编辑退出方式"
                          >
                            编辑
                          </button>
                          {isExitModeEditing ? (
                            <>
                              <button
                                type="button"
                                className={styles.detailEditButton}
                                onClick={() => { void submitExitMode(); }}
                                disabled={exitModePending || !strategy?.id}
                                aria-label="保存退出方式"
                              >
                                保存
                              </button>
                              <button
                                type="button"
                                className={styles.detailEditButton}
                                onClick={cancelExitModeEdit}
                                disabled={exitModePending}
                                aria-label="取消退出方式编辑"
                              >
                                取消
                              </button>
                            </>
                          ) : null}
                        </div>
                      </div>
                      <div>
                        <div className={styles.detailLabel}>Schedule</div>
                        <div className={styles.detailValue}>
                          {scheduleWindows.length
                            ? `${scheduleWindows[0]!.start} → ${scheduleWindows[0]!.end}`
                          : '默认全天'}
                      </div>
                    </div>
                    <div>
                      <div className={styles.detailLabel}>Timezone</div>
                      <div className={styles.detailValue}>{scheduleTimezone}</div>
                    </div>
                    {scheduleTimezoneNotice ? (
                      <div className={clsx(styles.statusMessage, styles.statusWarning)}>
                        {scheduleTimezoneNotice}
                      </div>
                    ) : null}
                    <div>
                      <div className={styles.detailLabel}>Key Behaviors</div>
                      <div className={styles.detailValue}>{strategyDescription ?? '暂无描述'}</div>
                    </div>
                  </div>
                  {scheduleWindows.length > 1 ? (
                    <div className={styles.scheduleList}>
                      {scheduleWindows.slice(1).map((window) => (
                        <span key={`${window.start}-${window.end}`} className={styles.scheduleBadge}>
                          {window.start} → {window.end}
                        </span>
                      ))}
                    </div>
                  ) : null}
                  {summaryMessage ? (
                    <div
                      className={clsx(
                        styles.statusMessage,
                        summaryStatusTone === 'success' && styles.statusSuccess,
                        summaryStatusTone === 'error' && styles.statusError
                      )}
                    >
                      {summaryMessage}
                    </div>
                  ) : null}
                </div>
              )}

              <>
                  <div className={styles.sectionCard}>
                    <div className={styles.sectionHeaderRow}>
                      <div className={styles.sectionHeader}>Strategy Parameters</div>
                      {parameterCount ? (
                        <span className={styles.parameterCount}>共 {parameterCount} 项</span>
                      ) : null}
                    </div>
                    {parameterCount ? (
                      <>
                        <div className={styles.parameterTableWrapper}>
                          <table className={styles.parameterTable}>
                            <thead>
                              <tr>
                                <th>Parameter</th>
                                <th>Value</th>
                                <th>Range</th>
                                <th>Default</th>
                                <th>Description</th>
                              </tr>
                            </thead>
                            <tbody>
                              {parameterDefinitions.map((definition, index) => {
                                const key = definition.name || definition.label || `parameter-${index}`;
                                const isEditing = editingParameter === definition.name;
                                const isSaving =
                                  parameterStatus === 'loading' && pendingParameter === definition.name;
                                // Percent-aware range display for pressure thresholds when relative imbalance is enabled
                                const relativeImbalanceEnabled = (getParameterValue('use_relative_imbalance') ?? '')
                                  .trim()
                                  .toLowerCase() === 'true';
      const isPressureThresholdParam = definition.name === 'pressure_threshold';
                                const rangeText = (() => {
                                  if (!(relativeImbalanceEnabled && isPressureThresholdParam)) {
                                    return formatParameterRange(definition);
                                  }
                                  const parts: string[] = [];
                                  const { min, max, step } = definition;
                                  const hasMin = typeof min === 'number' && Number.isFinite(min);
                                  const hasMax = typeof max === 'number' && Number.isFinite(max);
                                  if (hasMin && hasMax) {
                                    parts.push(`${formatPercent(min!)} – ${formatPercent(max!)}`);
                                  } else if (hasMin) {
                                    parts.push(`≥ ${formatPercent(min!)}`);
                                  } else if (hasMax) {
                                    parts.push(`≤ ${formatPercent(max!)}`);
                                  }
                                  if (typeof step === 'number' && Number.isFinite(step) && step > 0) {
                                    const stepLabel = formatPercent(step);
                                    parts.push(`步长 ${stepLabel}`);
                                  }
                                  return parts.length ? parts.join(' · ') : '—';
                                })();
                                const defaultValueText = formatParameterValueDisplay(
                                  definition.defaultValue ?? null
                                );
                                const descriptionText =
                                  definition.description && definition.description.trim()
                                    ? definition.description
                                    : '—';
                                return (
                                  <Fragment key={key}>
                                    <tr
                                      className={clsx(
                                        styles.parameterTableRow,
                                        isEditing && styles.parameterRowEditing,
                                        isSaving && styles.parameterRowSaving
                                      )}
                                      data-parameter-name={definition.name ?? `parameter-${index}`}
                                    >
                                      <td className={styles.parameterNameCell}>
                                        {definition.label ?? definition.name}
                                      </td>
                                      <td
                                        className={clsx(
                                          styles.parameterValueCell,
                                          isEditing && styles.parameterValueCellEditing
                                        )}
                                        onDoubleClick={() => beginParameterEdit(definition)}
                                      >
                                        {isEditing
                                          ? renderParameterEditor(definition, isSaving)
                                          : (
                                              <span className={styles.parameterValueDisplay}>
                                                {(() => {
                                                  if (
                                                    relativeImbalanceEnabled &&
                                                    isPressureThresholdParam &&
                                                    typeof definition.value === 'number' &&
                                                    Number.isFinite(definition.value) &&
                                                    definition.value <= 1
                                                  ) {
                                                    return formatPercent(definition.value);
                                                  }
                                                  const nameLower = (definition.name ?? '').toLowerCase();
                                                  const isExitModeParam = ['mode', 'exit_mode', 'exit_type', 'exit_strategy', 'strategy_exit', 'exit_method'].includes(nameLower);
                                                  if (isExitModeParam) {
                                                    const options = buildExitOptions({ definition, currentValue: definition.value ?? null }, defaultExitOptions);
                                                    const valueStr = toOptionValueString(definition.value);
                                                    const match = options.find((opt) => opt.value === valueStr);
                                                    return match?.label ?? formatParameterValueDisplay(definition.value);
                                                  }
                                                  return formatParameterValueDisplay(definition.value);
                                                })()}
                                              </span>
                                            )}
                                      </td>
                                      <td className={styles.parameterRangeCell}>{rangeText}</td>
                                      <td className={styles.parameterDefaultCell}>{defaultValueText}</td>
                                      <td className={styles.parameterDescriptionCell}>{descriptionText}</td>
                                    </tr>
                                    {isEditing && parameterInlineError ? (
                                      <tr className={styles.parameterErrorRow}>
                                        <td className={styles.parameterInlineError} colSpan={5}>
                                          {parameterInlineError}
                                        </td>
                                      </tr>
                                    ) : null}
                                  </Fragment>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                        <div className={styles.parameterFooter}>
                          <div className={styles.parameterHint}>双击参数值即可编辑，Enter 保存，Esc 取消。</div>
                          {parameterBanner ? (
                            <div
                              className={clsx(
                                styles.statusMessage,
                                parameterBanner.tone === 'success' && styles.statusSuccess,
                                parameterBanner.tone === 'error' && styles.statusError
                              )}
                            >
                              {parameterBanner.text}
                            </div>
                          ) : null}
                        </div>
                      </>
                    ) : (
                      <div className={styles.emptyBody}>尚未配置参数。</div>
                    )}
                  </div>

                  <div className={styles.sectionCard}>
                    <div className={styles.sectionHeader}>Position Timing Controls</div>
                    <div className={styles.detailGrid}>
                      <div>
                        <div className={styles.detailLabel}>Stop Loss</div>
                        <div className={styles.detailValue}>未配置</div>
                      </div>
                      <div>
                        <div className={styles.detailLabel}>Take Profit</div>
                        <div className={styles.detailValue}>未配置</div>
                      </div>
                    </div>
                  </div>
              </>
            </div>
            <aside className={styles.runtimeCard}>
              <div className={styles.runtimeHeader}>
                <div>
                  <div className={styles.sectionHeader}>{t('strategies.runtime.ui.title')}</div>
                  <div className={styles.runtimeSubtext}>
                    {t('strategies.runtime.ui.status_prefix')} {runtimeStatusText} · {t(
                      'strategies.runtime.ui.last_refresh_prefix'
                    )} {formatTimestamp(runtimeRefreshedAt)}
                  </div>
                </div>
                <div className={styles.runtimeActions}>
                  <button
                    type="button"
                    className={styles.refreshButton}
                    onClick={handleRefreshRuntime}
                    disabled={runtimeLoading || !strategy?.id}
                  >
                    {runtimeLoading
                      ? t('strategies.runtime.ui.refreshing')
                      : t('strategies.runtime.ui.refresh')}
                  </button>
                </div>
              </div>
              {runtimeError ? (
                <div className={clsx(styles.statusMessage, styles.statusError)}>{runtimeError}</div>
              ) : null}
              {runtimeLoading ? (
                <div className={styles.formHint}>{t('strategies.runtime.ui.refreshing_hint')}</div>
              ) : null}
              {runtimeMode === 'dom' ? (
                <>
                  {domRuntimeMetricsList.length > 1 ? (
                    <>
                      <div className={styles.runtimeSymbolGrid}>
                        {domRuntimeMetricsList.map((metrics, index) => {
                          const symbolLabel = metrics.dataPushSymbol ?? `Symbol ${index + 1}`;
                          const cardReceivingIsOff =
                            metrics.isReceivingData === false && !metrics.awaitingData;
                          const cardHintText = formatDataFeedHint(metrics);
                          const isPrimaryCard =
                            metrics === primaryDomRuntimeMetrics ||
                            (primaryDomRuntimeMetrics.dataPushSymbol &&
                              metrics.dataPushSymbol === primaryDomRuntimeMetrics.dataPushSymbol);
                          const showResubscribe = isPrimaryCard && receivingResubscribeEligible;
                          const resubscribeInputId = `resubscribe-conid-${index}`;
                          return (
                            <section
                              key={`${symbolLabel}-${index}`}
                              className={styles.runtimeSymbolCard}
                            >
                              <div className={styles.runtimeSymbolHeader}>
                                <span className={styles.runtimeSymbolTag}>{symbolLabel}</span>
                              </div>
                              <div className={styles.runtimeMetricsGrid}>
                                <div className={styles.runtimeMetric}>
                                  <div className={styles.runtimeMetricLabel}>Receiving Data</div>
                                  {cardReceivingIsOff ? (
                                    <button
                                      type="button"
                                      className={clsx(
                                        styles.runtimeMetricValue,
                                        styles.runtimeStatusButton,
                                        metrics.isReceivingData === true && styles.runtimeMetricPositive,
                                        metrics.awaitingData && styles.runtimeMetricWarning,
                                        cardReceivingIsOff ? styles.runtimeMetricNegative : null
                                      )}
                                      onClick={handleRuntimeResync}
                                      disabled={runtimeResyncPending || !strategyKey}
                                    >
                                      {runtimeResyncPending
                                        ? t('strategies.runtime.ui.refreshing')
                                        : formatReceivingStatus(metrics)}
                                    </button>
                                  ) : (
                                    <div
                                      className={clsx(
                                        styles.runtimeMetricValue,
                                        metrics.isReceivingData === true && styles.runtimeMetricPositive,
                                        metrics.awaitingData && styles.runtimeMetricWarning,
                                        cardReceivingIsOff ? styles.runtimeMetricNegative : null
                                      )}
                                    >
                                      {formatReceivingStatus(metrics)}
                                    </div>
                                  )}
                                  {cardHintText ? (
                                    <div className={styles.runtimeMetricHint}>{cardHintText}</div>
                                  ) : null}
                                  {showResubscribe ? (
                                    <div className={styles.resubscribeControls}>
                                      <label
                                        className={styles.resubscribeLabel}
                                        htmlFor={resubscribeInputId}
                                      >
                                        IB 合约 ID（conId）
                                      </label>
                                      <div className={styles.resubscribeInputRow}>
                                        <input
                                          id={resubscribeInputId}
                                          type="text"
                                          className={styles.resubscribeInput}
                                          value={resubscribeConId}
                                          onChange={handleResubscribeConIdChange}
                                          placeholder="可选：已知 conId"
                                          disabled={resubscribePending}
                                        />
                                        <button
                                          type="button"
                                          className={styles.resubscribeButton}
                                          onClick={handleResubscribe}
                                          disabled={resubscribePending}
                                        >
                                          {resubscribePending ? '重新订阅中…' : '重新订阅'}
                                        </button>
                                      </div>
                                      <div className={styles.resubscribeHint}>
                                        提前提供合约 ID 可直接命中已知 IB 合约，无需额外资格确认。
                                      </div>
                                    </div>
                                  ) : null}
                                </div>
                                {renderSubscriptionStatus(metrics)}
                              </div>
                              <div className={styles.runtimeLogSection}>
                                <div className={styles.runtimeLogHeaderRow}>
                                  <div className={styles.runtimeLogTitle}>Data Feed Log</div>
                                  {cardHintText ? (
                                    <div className={styles.runtimeLogHint}>{cardHintText}</div>
                                  ) : null}
                                </div>
                                {metrics.dataFeedLogs.length ? (
                                  <ul className={styles.runtimeLogList}>
                                    {metrics.dataFeedLogs.map((log, logIndex) => {
                                      const keyParts = [log.id, log.timestamp, logIndex].filter(
                                        (part) => part !== null && part !== undefined && part !== ''
                                      );
                                      const itemKey = keyParts.length
                                        ? keyParts.join('-')
                                        : `log-${logIndex}`;
                                      // Determine if relative imbalance formatting should be applied
                                      const relativeImbalanceEnabled = (getParameterValue('use_relative_imbalance') ?? '')
                                        .trim()
                                        .toLowerCase() === 'true';
                                      const logHasImbalanceContext = relativeImbalanceEnabled
                                        ? log.details.some((d) => /imbalance|\bobi\b|obiratio|adaptive_threshold/i.test(d.key))
                                        : false;
                                      const formatDetailValue = (key: string, raw: string): string => {
                                        if (!relativeImbalanceEnabled) {
                                          return raw;
                                        }
                                        const normalizedKey = key.trim().toLowerCase();
                                        const isImbalanceKey = /imbalance|\bobi\b|obiratio|adaptive_threshold/.test(normalizedKey);
                                        const isThresholdKey = /threshold/.test(normalizedKey) && logHasImbalanceContext;
                                        if (!(isImbalanceKey || isThresholdKey)) {
                                          return raw;
                                        }
                                        const parsed = Number(raw);
                                        if (!Number.isFinite(parsed)) {
                                          return raw;
                                        }
                                        // Smart percent formatting: ratios (|x|<=1) -> x*100%; percent-coded (|x|>1) -> (x/100)*100%
                                        const scaled = Math.abs(parsed) > 1 ? parsed / 100 : parsed;
                                        return formatPercent(scaled);
                                      };
                                      return (
                                        <li key={itemKey} className={styles.runtimeLogItem}>
                                          <div className={styles.runtimeLogHeader}>
                                            <span
                                              className={clsx(
                                                styles.runtimeLogLevel,
                                                RUNTIME_LOG_LEVEL_CLASS[log.tone]
                                              )}
                                            >
                                              {log.level}
                                            </span>
                                            {log.timestamp ? (
                                              <span className={styles.runtimeLogTimestamp}>
                                                {log.timestamp}
                                              </span>
                                            ) : null}
                                          </div>
                                          <div className={styles.runtimeLogMessage}>
                                            {log.message || '—'}
                                          </div>
                                          {log.details.length ? (
                                            <dl className={styles.runtimeLogDetails}>
                                              {log.details.map((detail, detailIndex) => (
                                                <div
                                                  key={`${log.id}-detail-${detailIndex}`}
                                                  className={styles.runtimeLogDetail}
                                                >
                                                  <dt className={styles.runtimeLogDetailKey}>
                                                    {detail.key}
                                                  </dt>
                                                  <dd className={styles.runtimeLogDetailValue}>
                                                    {formatDetailValue(
                                                      detail.key,
                                                      formatRuntimeLogDetailValue(detail.key, detail.value)
                                                    )}
                                                  </dd>
                                                </div>
                                              ))}
                                            </dl>
                                          ) : null}
                                        </li>
                                      );
                                    })}
                                  </ul>
                                ) : (
                                  <div className={styles.emptyBody}>No records yet</div>
                                )}
                              </div>
                            </section>
                          );
                        })}
                      </div>
                      <div className={styles.runtimeMetricsGrid}>
                        {runnerMetricCard}
                        <div className={styles.runtimeMetric}>
                          <div className={styles.runtimeMetricLabel}>Runtime (s)</div>
                          <div className={styles.runtimeMetricValue}>
                            {formatRuntimeSeconds(primaryDomRuntimeMetrics.runtimeSeconds)}
                          </div>
                        </div>
                        <div className={styles.runtimeMetric}>
                          <div className={styles.runtimeMetricLabel}>DOM Messages</div>
                          <div className={styles.runtimeMetricValue}>
                            {formatNumber(primaryDomRuntimeMetrics.domMessages, 0)}
                          </div>
                        </div>
                        <div className={styles.runtimeMetric}>
                          <div className={styles.runtimeMetricLabel}>Threshold Hits</div>
                          <div className={styles.runtimeMetricValue}>
                            {formatNumber(primaryDomRuntimeMetrics.thresholdHits, 0)}
                          </div>
                        </div>
                        <div className={styles.runtimeMetric}>
                          <div className={styles.runtimeMetricLabel}>Buy Signals</div>
                          <div className={styles.runtimeMetricValue}>
                            {formatNumber(primaryDomRuntimeMetrics.buySignals, 0)}
                          </div>
                        </div>
                        <div className={styles.runtimeMetric}>
                          <div className={styles.runtimeMetricLabel}>Sell Signals</div>
                          <div className={styles.runtimeMetricValue}>
                            {formatNumber(primaryDomRuntimeMetrics.sellSignals, 0)}
                          </div>
                        </div>
                        <div className={styles.runtimeMetric}>
                          <div className={styles.runtimeMetricLabel}>Stop Loss Price</div>
                          <div className={styles.runtimeMetricValue}>
                            {formatStopPrice(
                              primaryDomRuntimeMetrics.stopLossEnabled,
                              effectiveStopLossPrice
                            )}
                          </div>
                        </div>
                        <div className={styles.runtimeMetric}>
                          <div className={styles.runtimeMetricLabel}>Take Profit Price</div>
                          <div className={styles.runtimeMetricValue}>
                            {formatStopPrice(
                              primaryDomRuntimeMetrics.takeProfitEnabled,
                              effectiveTakeProfitPrice
                            )}
                          </div>
                        </div>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className={styles.runtimeMetricsGrid}>
                        <div className={styles.runtimeMetric}>
                          <div className={styles.runtimeMetricLabel}>Receiving Data</div>
                          {domReceivingIsOff ? (
                            <button
                              type="button"
                              className={clsx(
                                styles.runtimeMetricValue,
                                styles.runtimeStatusButton,
                                primaryDomRuntimeMetrics.isReceivingData === true &&
                                  styles.runtimeMetricPositive,
                                primaryDomRuntimeMetrics.awaitingData && styles.runtimeMetricWarning,
                                domReceivingIsOff ? styles.runtimeMetricNegative : null
                              )}
                              onClick={handleRuntimeResync}
                              disabled={runtimeResyncPending || !strategyKey}
                            >
                              {runtimeResyncPending
                                ? t('strategies.runtime.ui.refreshing')
                                : formatReceivingStatus(primaryDomRuntimeMetrics)}
                            </button>
                          ) : (
                            <div
                              className={clsx(
                                styles.runtimeMetricValue,
                                primaryDomRuntimeMetrics.isReceivingData === true &&
                                  styles.runtimeMetricPositive,
                                primaryDomRuntimeMetrics.awaitingData && styles.runtimeMetricWarning,
                                domReceivingIsOff ? styles.runtimeMetricNegative : null
                              )}
                            >
                              {formatReceivingStatus(primaryDomRuntimeMetrics)}
                            </div>
                          )}
                          {receivingHintText ? (
                            <div className={styles.runtimeMetricHint}>{receivingHintText}</div>
                          ) : null}
                          {receivingResubscribeEligible ? (
                            <div className={styles.resubscribeControls}>
                              <label className={styles.resubscribeLabel} htmlFor="resubscribe-conid">
                                IB 合约 ID（conId）
                              </label>
                              <div className={styles.resubscribeInputRow}>
                                <input
                                  id="resubscribe-conid"
                                  type="text"
                                  className={styles.resubscribeInput}
                                  value={resubscribeConId}
                                  onChange={handleResubscribeConIdChange}
                                  placeholder="可选：已知 conId"
                                  disabled={resubscribePending}
                                />
                                <button
                                  type="button"
                                  className={styles.resubscribeButton}
                                  onClick={handleResubscribe}
                                  disabled={resubscribePending}
                                >
                                  {resubscribePending ? '重新订阅中…' : '重新订阅'}
                                </button>
                              </div>
                              <div className={styles.resubscribeHint}>
                                提前提供合约 ID 可直接命中已知 IB 合约，无需额外资格确认。
                              </div>
                            </div>
                          ) : null}
                        </div>
                        {renderSubscriptionStatus(primaryDomRuntimeMetrics)}
                        {runnerMetricCard}
                        <div className={styles.runtimeMetric}>
                          <div className={styles.runtimeMetricLabel}>Runtime (s)</div>
                          <div className={styles.runtimeMetricValue}>
                            {formatRuntimeSeconds(primaryDomRuntimeMetrics.runtimeSeconds)}
                          </div>
                        </div>
                        <div className={styles.runtimeMetric}>
                          <div className={styles.runtimeMetricLabel}>DOM Messages</div>
                          <div className={styles.runtimeMetricValue}>
                            {formatNumber(primaryDomRuntimeMetrics.domMessages, 0)}
                          </div>
                        </div>
                        <div className={styles.runtimeMetric}>
                          <div className={styles.runtimeMetricLabel}>Threshold Hits</div>
                          <div className={styles.runtimeMetricValue}>
                            {formatNumber(primaryDomRuntimeMetrics.thresholdHits, 0)}
                          </div>
                        </div>
                        <div className={styles.runtimeMetric}>
                          <div className={styles.runtimeMetricLabel}>Buy Signals</div>
                          <div className={styles.runtimeMetricValue}>
                            {formatNumber(primaryDomRuntimeMetrics.buySignals, 0)}
                          </div>
                        </div>
                        <div className={styles.runtimeMetric}>
                          <div className={styles.runtimeMetricLabel}>Sell Signals</div>
                          <div className={styles.runtimeMetricValue}>
                            {formatNumber(primaryDomRuntimeMetrics.sellSignals, 0)}
                          </div>
                        </div>
                        <div className={styles.runtimeMetric}>
                          <div className={styles.runtimeMetricLabel}>Stop Loss Price</div>
                          <div className={styles.runtimeMetricValue}>
                            {formatStopPrice(
                              primaryDomRuntimeMetrics.stopLossEnabled,
                              effectiveStopLossPrice
                            )}
                          </div>
                        </div>
                        <div className={styles.runtimeMetric}>
                          <div className={styles.runtimeMetricLabel}>Take Profit Price</div>
                          <div className={styles.runtimeMetricValue}>
                            {formatStopPrice(
                              primaryDomRuntimeMetrics.takeProfitEnabled,
                              effectiveTakeProfitPrice
                            )}
                          </div>
                        </div>
                      </div>
                      <div className={styles.runtimeLogSection}>
                        <div className={styles.runtimeLogHeaderRow}>
                          <div className={styles.runtimeLogTitle}>Data Feed Log</div>
                          {runtimeLogHintText ? (
                            <div className={styles.runtimeLogHint}>{runtimeLogHintText}</div>
                          ) : null}
                        </div>
                        {primaryDomRuntimeMetrics.dataFeedLogs.length ? (
                          <ul className={styles.runtimeLogList}>
                            {primaryDomRuntimeMetrics.dataFeedLogs.map((log, index) => {
                              const keyParts = [log.id, log.timestamp, index].filter(
                                (part) => part !== null && part !== undefined && part !== ''
                              );
                              const itemKey = keyParts.length ? keyParts.join('-') : `log-${index}`;
                              // Determine if relative imbalance formatting should be applied
                              const relativeImbalanceEnabled = (getParameterValue('use_relative_imbalance') ?? '')
                                .trim()
                                .toLowerCase() === 'true';
                              const logHasImbalanceContext = relativeImbalanceEnabled
                                ? log.details.some((d) => /imbalance|\bobi\b|obiratio|adaptive_threshold/i.test(d.key))
                                : false;
                              const formatDetailValue = (key: string, raw: string): string => {
                                if (!relativeImbalanceEnabled) {
                                  return raw;
                                }
                                const normalizedKey = key.trim().toLowerCase();
                                const isImbalanceKey = /imbalance|\bobi\b|obiratio|adaptive_threshold/.test(normalizedKey);
                                const isThresholdKey = /threshold/.test(normalizedKey) && logHasImbalanceContext;
                                if (!(isImbalanceKey || isThresholdKey)) {
                                  return raw;
                                }
                                const parsed = Number(raw);
                                if (!Number.isFinite(parsed)) {
                                  return raw;
                                }
                                // Smart percent formatting: ratios (|x|<=1) -> x*100%; percent-coded (|x|>1) -> (x/100)*100%
                                const scaled = Math.abs(parsed) > 1 ? parsed / 100 : parsed;
                                return formatPercent(scaled);
                              };
                              return (
                                <li key={itemKey} className={styles.runtimeLogItem}>
                                  <div className={styles.runtimeLogHeader}>
                                    <span
                                      className={clsx(
                                        styles.runtimeLogLevel,
                                        RUNTIME_LOG_LEVEL_CLASS[log.tone]
                                      )}
                                    >
                                      {log.level}
                                    </span>
                                    {log.timestamp ? (
                                      <span className={styles.runtimeLogTimestamp}>
                                        {log.timestamp}
                                      </span>
                                    ) : null}
                                  </div>
                                  <div className={styles.runtimeLogMessage}>{log.message || '—'}</div>
                                  {log.details.length ? (
                                    <dl className={styles.runtimeLogDetails}>
                                      {log.details.map((detail, detailIndex) => (
                                        <div
                                          key={`${log.id}-detail-${detailIndex}`}
                                          className={styles.runtimeLogDetail}
                                        >
                                          <dt className={styles.runtimeLogDetailKey}>{detail.key}</dt>
                                          <dd className={styles.runtimeLogDetailValue}>
                                            {formatDetailValue(
                                              detail.key,
                                              formatRuntimeLogDetailValue(detail.key, detail.value)
                                            )}
                                          </dd>
                                        </div>
                                      ))}
                                    </dl>
                                  ) : null}
                                </li>
                              );
                            })}
                          </ul>
                        ) : (
                          <div className={styles.emptyBody}>No records yet</div>
                        )}
                      </div>
                    </>
                  )}
                </>
              ) : (
                <>
                  <div className={styles.runtimeMetricsGrid}>{runnerMetricCard}</div>
                  <div className={styles.runtimePhaseGrid}>
                    {klineRuntimeMetrics.phases.map((phase) => {
                      const toneClassName =
                        RUNTIME_LOG_LEVEL_CLASS[phase.statusTone] ?? styles.runtimeLogLevelInfo;
                      return (
                        <section key={phase.key} className={styles.runtimePhaseCard}>
                          <div className={styles.runtimePhaseHeader}>
                            <div className={styles.runtimePhaseTitleRow}>
                              <div className={styles.runtimePhaseTitle}>{phase.title}</div>
                              {phase.status ? (
                                <span className={clsx(styles.runtimeLogLevel, toneClassName)}>
                                  {phase.status}
                                </span>
                              ) : null}
                            </div>
                            {phase.statusDescriptor ? (
                              <div className={styles.runtimePhaseDescriptor}>{phase.statusDescriptor}</div>
                            ) : null}
                            {phase.statusCause && phase.statusCause !== phase.statusDescriptor ? (
                              <div className={styles.runtimePhaseCause}>{phase.statusCause}</div>
                            ) : null}
                          </div>
                          {isDynamicOrbStrategy && phase.key === 'batch_aggregation' ? (
                            <DynamicOrbRuntimePanel phase={phase} />
                          ) : phase.metrics.length ? (
                            <dl className={styles.runtimePhaseMetrics}>
                              {phase.metrics.map((metric) => (
                                <div key={metric.key} className={styles.runtimePhaseMetricRow}>
                                  <dt className={styles.runtimePhaseMetricLabel}>{metric.label}</dt>
                                  <dd className={styles.runtimePhaseMetricValue}>{metric.value}</dd>
                                </div>
                              ))}
                            </dl>
                          ) : (
                            <div className={styles.runtimePhaseEmpty}>暂无阶段指标</div>
                          )}
                          {phase.key === 'signal_generation' ? (
                            <div className={styles.signalTelemetryGroup}>
                              <div className={styles.runtimePhaseLogs}>
                                <div className={styles.runtimePhaseLogsTitle}>阶段信号</div>
                                {phase.stageSignals.length ? (
                                  <ul className={styles.runtimeLogList}>
                                    {phase.stageSignals.map((log, index) => {
                                      const logKey = `${phase.key}-stage-${log.id}-${index}`;
                                      return (
                                        <li key={logKey} className={styles.runtimeLogItem}>
                                          <div className={styles.runtimeLogHeader}>
                                            <span
                                              className={clsx(
                                                styles.runtimeLogLevel,
                                                RUNTIME_LOG_LEVEL_CLASS[log.tone]
                                              )}
                                            >
                                              {log.level}
                                            </span>
                                            {log.timestamp ? (
                                              <span className={styles.runtimeLogTimestamp}>
                                                {log.timestamp}
                                              </span>
                                            ) : null}
                                          </div>
                                          <div className={styles.runtimeLogMessage}>
                                            {log.message || '—'}
                                          </div>
                                          {log.details.length ? (
                                            <dl className={styles.runtimeLogDetails}>
                                              {log.details.map((detail, detailIndex) => (
                                                <div
                                                  key={`${logKey}-detail-${detailIndex}`}
                                                  className={styles.runtimeLogDetail}
                                                >
                                                  <dt className={styles.runtimeLogDetailKey}>
                                                    {detail.key}
                                                  </dt>
                                                  <dd className={styles.runtimeLogDetailValue}>
                                                    {formatRuntimeLogDetailValue(
                                                      detail.key,
                                                      detail.value
                                                    )}
                                                  </dd>
                                                </div>
                                              ))}
                                            </dl>
                                          ) : null}
                                        </li>
                                      );
                                    })}
                                  </ul>
                                ) : (
                                  <div className={styles.runtimePhaseEmpty}>暂无阶段信号</div>
                                )}
                              </div>
                              <div className={styles.runtimePhaseLogs}>
                                <div className={styles.runtimePhaseLogsTitle}>交易信号</div>
                                {phase.signalEvents.length ? (
                                  <ul className={styles.signalEventList}>
                                    {phase.signalEvents.map((event, index) => (
                                      <li
                                        key={`${phase.key}-signal-${index}`}
                                        className={styles.signalEventItem}
                                        data-testid="signal-event-item"
                                      >
                                        <span
                                          className={clsx(
                                            styles.signalEventSide,
                                            event.side === 'BUY'
                                              ? styles.signalEventBuy
                                              : styles.signalEventSell
                                          )}
                                        >
                                          {event.side}
                                        </span>
                                        {event.timestamp ? (
                                          <span className={styles.signalEventTimestamp}>
                                            {formatTimestamp(event.timestamp)}
                                          </span>
                                        ) : (
                                          <span className={styles.signalEventTimestamp}>—</span>
                                        )}
                                      </li>
                                    ))}
                                  </ul>
                                ) : (
                                  <div className={styles.runtimePhaseEmpty}>暂无交易信号</div>
                                )}
                              </div>
                              <div className={styles.runtimePhaseLogs}>
                                <div className={styles.runtimePhaseLogsTitle}>数据处理日志</div>
                                {phase.dataProcessingLogs.length ? (
                                  <ul className={styles.runtimeLogList}>
                                    {phase.dataProcessingLogs.map((log, index) => {
                                      const logKey = `${phase.key}-processing-${log.id}-${index}`;
                                      return (
                                        <li key={logKey} className={styles.runtimeLogItem}>
                                          <div className={styles.runtimeLogHeader}>
                                            <span
                                              className={clsx(
                                                styles.runtimeLogLevel,
                                                RUNTIME_LOG_LEVEL_CLASS[log.tone]
                                              )}
                                            >
                                              {log.level}
                                            </span>
                                            {log.timestamp ? (
                                              <span className={styles.runtimeLogTimestamp}>
                                                {log.timestamp}
                                              </span>
                                            ) : null}
                                          </div>
                                          <div className={styles.runtimeLogMessage}>
                                            {log.message || '—'}
                                          </div>
                                          {log.details.length ? (
                                            <dl className={styles.runtimeLogDetails}>
                                              {log.details.map((detail, detailIndex) => (
                                                <div
                                                  key={`${logKey}-detail-${detailIndex}`}
                                                  className={styles.runtimeLogDetail}
                                                >
                                                  <dt className={styles.runtimeLogDetailKey}>
                                                    {detail.key}
                                                  </dt>
                                                  <dd className={styles.runtimeLogDetailValue}>
                                                    {formatRuntimeLogDetailValue(
                                                      detail.key,
                                                      detail.value
                                                    )}
                                                  </dd>
                                                </div>
                                              ))}
                                            </dl>
                                          ) : null}
                                        </li>
                                      );
                                    })}
                                  </ul>
                                ) : (
                                  <div className={styles.runtimePhaseEmpty}>暂无数据处理日志</div>
                                )}
                              </div>
                            </div>
                          ) : phase.key === 'order_execution' ? (
                            phase.logs.length ? (
                              <div className={styles.runtimePhaseLogs}>
                                <div className={styles.runtimePhaseLogsTitle}>阶段日志</div>
                                <ul className={styles.runtimeLogList}>
                                  {phase.logs.slice(0, RUNTIME_PHASE_LOG_LIMIT).map((log, index) => {
                                    const logKey = `${phase.key}-${log.id}-${index}`;
                                    return (
                                      <li key={logKey} className={styles.runtimeLogItem}>
                                        <div className={styles.runtimeLogHeader}>
                                          <span
                                            className={clsx(
                                              styles.runtimeLogLevel,
                                              RUNTIME_LOG_LEVEL_CLASS[log.tone]
                                            )}
                                          >
                                            {log.level}
                                          </span>
                                          {log.timestamp ? (
                                            <span className={styles.runtimeLogTimestamp}>
                                              {log.timestamp}
                                            </span>
                                          ) : null}
                                        </div>
                                        <div className={styles.runtimeLogMessage}>{log.message || '—'}</div>
                                        {log.details.length ? (
                                          <dl className={styles.runtimeLogDetails}>
                                            {log.details.map((detail, detailIndex) => (
                                              <div
                                            key={`${logKey}-detail-${detailIndex}`}
                                            className={styles.runtimeLogDetail}
                                          >
                                            <dt className={styles.runtimeLogDetailKey}>{detail.key}</dt>
                                            <dd className={styles.runtimeLogDetailValue}>
                                              {formatRuntimeLogDetailValue(detail.key, detail.value)}
                                            </dd>
                                          </div>
                                        ))}
                                          </dl>
                                        ) : null}
                                      </li>
                                    );
                                  })}
                                </ul>
                              </div>
                            ) : (
                              <div className={styles.runtimePhaseEmpty}>暂无阶段日志</div>
                            )
                          ) : phase.logs.length ? (
                            <div className={styles.runtimePhaseLogs}>
                              <div className={styles.runtimePhaseLogsTitle}>阶段日志</div>
                              <ul className={styles.runtimeLogList}>
                                {phase.logs.slice(0, RUNTIME_PHASE_LOG_LIMIT).map((log, index) => {
                                  const logKey = `${phase.key}-${log.id}-${index}`;
                                  return (
                                    <li key={logKey} className={styles.runtimeLogItem}>
                                      <div className={styles.runtimeLogHeader}>
                                        <span
                                          className={clsx(
                                            styles.runtimeLogLevel,
                                            RUNTIME_LOG_LEVEL_CLASS[log.tone]
                                          )}
                                        >
                                          {log.level}
                                        </span>
                                        {log.timestamp ? (
                                          <span className={styles.runtimeLogTimestamp}>
                                            {log.timestamp}
                                          </span>
                                        ) : null}
                                      </div>
                                      <div className={styles.runtimeLogMessage}>{log.message || '—'}</div>
                                      {log.details.length ? (
                                        <dl className={styles.runtimeLogDetails}>
                                          {log.details.map((detail, detailIndex) => (
                                            <div
                                              key={`${logKey}-detail-${detailIndex}`}
                                              className={styles.runtimeLogDetail}
                                            >
                                              <dt className={styles.runtimeLogDetailKey}>{detail.key}</dt>
                                              <dd className={styles.runtimeLogDetailValue}>
                                                {formatRuntimeLogDetailValue(detail.key, detail.value)}
                                              </dd>
                                            </div>
                                          ))}
                                        </dl>
                                      ) : null}
                                    </li>
                                  );
                                })}
                              </ul>
                            </div>
                          ) : null}
                        </section>
                      );
                    })}
                  </div>
                </>
              )}
            </aside>
          </div>
        ) : null}

        {activeTab === 'risk' && !isScreenerStrategy ? (
          <div className={styles.riskSection}>
            <div className={styles.riskForm}>
              {riskLoading ? (
                <div className={styles.formHint}>风险配置加载中...</div>
              ) : null}
              {riskFailed ? (
                <div className={clsx(styles.statusMessage, styles.statusError)}>
                  {riskError ?? '加载风险设置失败'}
                </div>
              ) : null}
              <div className={styles.formRow}>
                <label htmlFor="risk-max-position">Max Position Count</label>
                <input
                  id="risk-max-position"
                  type="number"
                  value={riskMaxPosition}
                  onChange={(event) => setRiskMaxPosition(event.target.value)}
                  disabled={riskLoading || riskSaving || !strategy?.id}
                  placeholder="Unlimited"
                />
                <span className={styles.formHint}>留空表示不限制持仓数量。</span>
              </div>
              <div className={styles.formRow}>
                <label htmlFor="risk-loss-time">Unrealized loss duration threshold (minutes)</label>
                <input
                  id="risk-loss-time"
                  type="number"
                  value={riskLossDuration}
                  onChange={(event) => setRiskLossDuration(event.target.value)}
                  disabled={riskLoading || riskSaving || !strategy?.id}
                  placeholder="e.g., 15"
                />
              </div>
              <div className={styles.formRow}>
                <label htmlFor="risk-loss-threshold">Unrealized loss threshold</label>
                <input
                  id="risk-loss-threshold"
                  type="number"
                  value={riskLossThreshold}
                  onChange={(event) => setRiskLossThreshold(event.target.value)}
                  disabled={riskLoading || riskSaving || !strategy?.id}
                  placeholder="<= 0"
                />
              </div>
              <div className={styles.formRow}>
                <label>Controls</label>
                <div className={styles.toggleRow}>
                  <input
                    id="risk-forbid"
                    type="checkbox"
                    checked={riskForbidPyramiding}
                    onChange={(event) => setRiskForbidPyramiding(event.target.checked)}
                    disabled={riskLoading || riskSaving || !strategy?.id}
                  />
                  <label htmlFor="risk-forbid">禁止加仓</label>
                </div>
                <div className={styles.toggleRow}>
                  <input
                    id="risk-notify"
                    type="checkbox"
                    checked={riskNotifyOnBreach}
                    onChange={(event) => setRiskNotifyOnBreach(event.target.checked)}
                    disabled={riskLoading || riskSaving || !strategy?.id}
                  />
                  <label htmlFor="risk-notify">触发阈值时发送通知</label>
                </div>
              </div>
              <div className={styles.formActions}>
                <button
                  type="button"
                  className={clsx(styles.formButton, styles.formButtonSecondary)}
                  onClick={() => {
                    setRiskMaxPosition(baselineRisk.maxPosition);
                    setRiskLossThreshold(baselineRisk.lossThreshold);
                    setRiskLossDuration(baselineRisk.lossDuration);
                    setRiskForbidPyramiding(baselineRisk.forbidPyramiding);
                    setRiskNotifyOnBreach(baselineRisk.notifyOnBreach);
                  }}
                  disabled={!riskDirty || riskLoading || riskSaving}
                >
                  Reset
                </button>
                <button
                  type="button"
                  className={clsx(styles.formButton, styles.formButtonPrimary)}
                  onClick={() => {
                    if (!strategy?.id) {
                      return;
                    }
                    const payload = {
                      strategyId: strategy.id,
                      maxPosition: parseNumericInput(riskMaxPosition),
                      lossThreshold: parseNumericInput(riskLossThreshold),
                      lossDurationMinutes: parseNumericInput(riskLossDuration),
                      forbidPyramiding: riskForbidPyramiding,
                      notifyOnBreach: riskNotifyOnBreach
                    };
                    void dispatch(saveStrategyRiskSettings(payload));
                  }}
                  disabled={!riskDirty || riskSaving || !strategy?.id}
                >
                  Save Settings
                </button>
              </div>
              <div
                className={clsx(
                  styles.statusMessage,
                  riskSaveSucceeded && styles.statusSuccess,
                  (riskSaveFailed || riskError) && styles.statusError
                )}
              >
                {riskMessage}
              </div>
            </div>
            <RiskLogList
              logs={memoizedRiskLogs}
              status={riskLogsStatus}
              error={riskLogsError}
              onRefresh={refreshRiskLogs}
              disabled={!strategy?.id}
            />
          </div>
        ) : null}

        {activeTab === 'orders' && !isScreenerStrategy ? (
          <div className={styles.ordersSection}>
            <div className={styles.ordersMeta}>
              <div className={styles.ordersMetaGroup}>
                <span>
                  共 {resolvedOrdersTotal} 条 · 当前页 {resolvedOrdersPage}
                </span>
                <span>每页 {resolvedOrdersPageSize} 条</span>
              </div>
              {performanceMarketTimezone ? (
                <div className={styles.ordersTimezone}>市场时区：{performanceMarketTimezone}</div>
              ) : null}
            </div>
            {ordersSectionLoading && ordersSnapshot?.orders?.length ? (
              <div className={styles.statusMessage}>成交记录加载中...</div>
            ) : null}
            {ordersSectionError && ordersSnapshot?.orders?.length ? (
              <div className={clsx(styles.statusMessage, styles.statusError)}>
                加载订单失败：{ordersSectionError}
              </div>
            ) : null}
            <div className={styles.tableWrapper}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Symbol</th>
                    <th>Action</th>
                    <th>Qty</th>
                    <th>Price</th>
                    <th>Status</th>
                    <th>Executed At</th>
                    <th>PnL</th>
                    <th>Commission</th>
                    <th>Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {ordersSnapshot?.orders?.length ? (
                    ordersSnapshot.orders.map((order) => {
                      const resolvedSymbol = order.symbol ?? strategy?.symbol ?? '—';
                      const rawStatus = order.status ?? order.metadata?.status;
                      const resolvedStatus =
                        rawStatus === null || rawStatus === undefined
                          ? '—'
                          : typeof rawStatus === 'string'
                            ? rawStatus
                            : String(rawStatus);
                      const resolvedQuantity = order.filledQuantity ?? order.quantity;
                      const resolvedPrice = order.averagePrice ?? order.price;
                      const resolvedTimestamp = order.executedAt ?? order.timestamp;
                      const metadataPnlRaw = order.metadata?.pnl;
                      const metadataPnl =
                        typeof metadataPnlRaw === 'number'
                          ? metadataPnlRaw
                          : typeof metadataPnlRaw === 'string'
                            ? Number(metadataPnlRaw)
                            : null;
                      const resolvedPnl =
                        order.realizedPnl ??
                        order.pnl ??
                        (typeof metadataPnl === 'number' && Number.isFinite(metadataPnl) ? metadataPnl : null);
                      const pnlClass =
                        resolvedPnl === null
                          ? undefined
                          : resolvedPnl < 0
                            ? styles.valueNegative
                            : resolvedPnl > 0
                              ? styles.valuePositive
                              : undefined;
                      const commissionDisplay =
                        order.commission === null || order.commission === undefined
                          ? '—'
                          : formatCurrency(order.commission);
                      const rawOrderNotes =
                        order.notes === undefined || order.notes === null || order.notes === ''
                          ? order.metadata?.notes
                          : order.notes;
                      const orderNotes =
                        rawOrderNotes === null || rawOrderNotes === undefined
                          ? '—'
                          : typeof rawOrderNotes === 'string'
                            ? rawOrderNotes
                            : String(rawOrderNotes);
                      return (
                        <tr key={order.id}>
                          <td>{order.id}</td>
                          <td>{resolvedSymbol}</td>
                          <td>{order.side}</td>
                          <td>{formatNumber(resolvedQuantity, 4)}</td>
                          <td>{formatNumber(resolvedPrice, 4)}</td>
                          <td>{resolvedStatus}</td>
                          <td>{formatTimestamp(resolvedTimestamp)}</td>
                          <td className={clsx(pnlClass)}>
                            {resolvedPnl === null || resolvedPnl === undefined
                              ? '—'
                              : formatCurrency(resolvedPnl)}
                          </td>
                          <td>{commissionDisplay}</td>
                          <td>{orderNotes}</td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={10} className={styles.emptyBody}>
                    {ordersSectionError
                          ? `加载订单失败：${ordersSectionError}`
                          : ordersSectionLoading
                            ? '成交记录加载中...'
                            : '暂无成交记录。'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className={styles.ordersPagination}>
              <button
                type="button"
                onClick={goToPreviousOrdersPage}
                disabled={!hasPreviousOrdersPage || ordersSectionLoading}
                className={styles.paginationButton}
              >
                上一页
              </button>
              <span>
                第 {resolvedOrdersPage} / {ordersTotalPages} 页
              </span>
              <button
                type="button"
                onClick={goToNextOrdersPage}
                disabled={!hasNextOrdersPage || ordersSectionLoading}
                className={styles.paginationButton}
              >
                下一页
              </button>
            </div>
          </div>
        ) : null}

        {activeTab === 'visual' && !isScreenerStrategy ? (
          <div className={styles.visualSection}>
            {chartsLoading && !performanceCharts ? (
              <div className={styles.statusMessage}>图表数据加载中...</div>
            ) : null}
            {chartsError ? (
              <div className={clsx(styles.statusMessage, styles.statusError)}>
                加载图表失败：{chartsError}
              </div>
            ) : null}
            <div className={styles.chartGrid}>
              <div className={styles.chartCard}>
                <div className={styles.chartHeader}>Cumulative PnL</div>
                <SparklineChart data={performanceCharts?.cumulativePnl ?? []} color="#2f80ed" />
              </div>
              <div className={styles.chartCard}>
                <div className={styles.chartHeader}>Drawdown</div>
                <SparklineChart data={performanceCharts?.drawdown ?? []} color="#eb5757" />
              </div>
              <div className={styles.chartCard}>
                <div className={styles.chartHeader}>PnL Distribution</div>
                <DistributionChart data={performanceCharts?.distribution ?? []} />
              </div>
              <div className={styles.chartCard}>
                <div className={styles.chartHeader}>Win/Loss Ratio</div>
                {performanceCharts?.winLoss?.length ? (
                  <WinLossSummary data={performanceCharts.winLoss} />
                ) : chartsLoading ? (
                  <div className={styles.chartPlaceholder}>图表数据加载中...</div>
                ) : (
                  <div className={styles.chartPlaceholder}>暂无数据</div>
                )}
              </div>
            </div>
          </div>
        ) : null}

        {activeTab === 'calendar' && !isScreenerStrategy ? (
          <div className={styles.calendarSection}>
            {calendarLoading && !calendarData ? (
              <div className={styles.statusMessage}>日历数据加载中...</div>
            ) : null}
            {calendarError ? (
              <div className={clsx(styles.statusMessage, styles.statusError)}>
                加载日历失败：{calendarError}
              </div>
            ) : null}
            <CalendarView
              calendar={calendarData}
              selectedPeriod={selectedPeriod}
              timezone={localTimezone}
            />
          </div>
        ) : null}

        {activeTab === 'candles' && !isScreenerStrategy ? (
          <div className={styles.candlesSection}>
            <div className={styles.candlesControls}>
              <label htmlFor="candles-interval">Interval</label>
              <select
                id="candles-interval"
                value={candlesInterval}
                onChange={(event) => setCandlesInterval(event.target.value)}
                disabled={!strategy?.id}
              >
                {CANDLE_INTERVAL_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            {candlesSymbol || candlesIntervalSeconds || candlesRefreshedAt ? (
              <div className={styles.candlesMeta}>
                {candlesSymbol ? <span>符号：{candlesSymbol}</span> : null}
                {resolvedCandlesInterval ? <span>周期：{resolvedCandlesInterval}</span> : null}
                {candlesIntervalSeconds ? <span>{candlesIntervalSeconds} 秒</span> : null}
                {candlesRefreshedAt ? <span>更新：{candlesRefreshedAt}</span> : null}
              </div>
            ) : null}
            {candlesLoading ? (
              <div className={styles.chartPlaceholderLarge}>蜡烛图加载中...</div>
            ) : candlesFailed ? (
              <div className={clsx(styles.chartPlaceholderLarge, styles.statusError)}>
                {candlesError ?? '加载蜡烛图失败'}
              </div>
            ) : candlestickBars.length === 0 ? (
              <div className={styles.chartPlaceholderLarge}>暂无蜡烛数据。</div>
            ) : (
              <>
                <CandlestickChart bars={candlestickBars} tradeMarkers={candleTradeMarkers} />
                {candlesSnapshot?.signals?.length ? (
                  <div className={styles.candleSignals}>
                    <div className={styles.sectionHeader}>Latest Signals</div>
                    <ul>
                      {candlesSnapshot.signals.slice(-5).map((signal, index) => (
                        <li key={`${signal.timestamp}-${index}`}>
                          <span>{formatTimestamp(signal.timestamp)}</span>
                          <span>{signal.side}</span>
                          <span>{formatNumber(signal.price, 2)}</span>
                          <span>{signal.pnl == null ? '—' : formatCurrency(signal.pnl)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </>
            )}
          </div>
        ) : null}

        <VolatilityRegimeMultipliersModal
          open={volatilityEditorState.open}
          parameterLabel={
            volatilityEditorState.definition?.label ??
            volatilityEditorState.definition?.name ??
            'volatility_regime_multipliers'
          }
          initialValue={volatilityEditorState.initialValue}
          saving={
            parameterStatus === 'loading' &&
            pendingParameter === volatilityEditorState.definition?.name
          }
          error={volatilityEditorState.error}
          onClose={closeVolatilityEditor}
          onSubmit={handleVolatilityModalSubmit}
        />
        <DisabledRegimesModal
          open={disabledRegimesEditorState.open}
          parameterLabel={
            disabledRegimesEditorState.definition?.label ??
            disabledRegimesEditorState.definition?.name ??
            'disabled_regimes'
          }
          initialValue={disabledRegimesEditorState.initialValue}
          saving={
            parameterStatus === 'loading' &&
            pendingParameter === disabledRegimesEditorState.definition?.name
          }
          error={disabledRegimesEditorState.error}
          onClose={closeDisabledRegimesEditor}
          onSubmit={handleDisabledRegimesModalSubmit}
        />
      </section>

    </div>
  );
}

export type { RiskLogView };
export { RiskLogList };

export default StrategyDetailPanel;
