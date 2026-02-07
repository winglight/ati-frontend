import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import clsx from 'clsx';
import Modal from './Modal';
import styles from './MarketDataModal.module.css';
import { useAppDispatch, useAppSelector } from '@store/hooks';
import type { SymbolInfo } from '@features/dashboard/types';
import { addToast } from '@store/slices/toastSlice';
import {
  fetchMarketDirectory,
  refreshMarketDirectory,
  type MarketDirectoryResult
} from '@services/marketDirectoryApi';
import {
  fetchMarketDataRangeEntries,
  requestHistoricalBackfill,
  type HistoricalBackfillScriptResponse,
  type MarketDataCatalogEntry
} from '@services/marketDataAdminApi';
import {
  stopMarketSubscription,
  listActiveSubscriptions,
  resubscribeMarketSubscriptions,
  type ActiveSubscriptionSummaryPayload,
  type MarketSubscriptionStreamPayload,
  type MarketSubscriptionStreamSubscriberPayload,
  type MarketSubscriptionStreamType
} from '@services/marketApi';
import {
  setMarketDataSubscriptions,
  setMarketDataSubscriptionsStatus,
  setMarketDataSubscriptionsStreamingEnabled
} from '@store/slices/strategiesSlice';

interface MarketDataModalProps {
  open: boolean;
  onClose: () => void;
}

type CoverageTreeNode = {
  id: string;
  label: string;
  items?: CoverageTreeLeaf[];
  children?: CoverageTreeNode[];
};

type CoverageTreeLeaf = {
  id: string;
  label: string;
  dataType: string;
  symbol: string;
  groupLabel: string;
  detailLabel: string;
};

type CoverageSelection = {
  nodeId: string;
  dataType: string;
  symbol: string;
  label: string;
  detailLabel: string;
};

const STOCK_TYPES = new Set(['STK', 'ETF', 'CFD']);
const FUTURES_TYPES = new Set(['FUT', 'FOP', 'FWD', 'CMDTY']);
const BAR_TIMEFRAMES = ['1m', '1h', '1d', '1w', '1M', '1y'];
const DKT_DATA_COVERAGE_MODAL_LABEL = 'DKT coverage modal data coverage';

const formatTimestamp = (value: string | null | undefined): string => {
  if (!value) {
    return '—';
  }
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    return value;
  }
  return new Date(parsed).toLocaleString();
};

const formatFileSize = (value: number | null | undefined): string => {
  if (value == null || !Number.isFinite(value)) {
    return '—';
  }
  if (value <= 0) {
    return '0 B';
  }
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let size = value;
  let index = 0;
  while (size >= 1024 && index < units.length - 1) {
    size /= 1024;
    index += 1;
  }
  const display = index >= 2 ? size.toFixed(2) : size.toFixed(1);
  return `${display} ${units[index]}`;
};

const fileNameFromPath = (path: string | null | undefined): string | null => {
  if (!path) {
    return null;
  }
  const normalized = path.replace(/\\+/g, '/');
  const segments = normalized.split('/').filter(Boolean);
  return segments.length ? segments[segments.length - 1] : null;
};

const extractDateFromPath = (path: string | null | undefined): string | null => {
  if (!path) {
    return null;
  }
  const normalized = path.replace(/\\+/g, '/');
  const structured = normalized.match(/(\d{4})[/-](\d{2})[/-](\d{2})/);
  if (structured) {
    return `${structured[1]}-${structured[2]}-${structured[3]}`;
  }
  const compact = normalized.match(/(\d{4})(\d{2})(\d{2})/);
  if (compact) {
    return `${compact[1]}-${compact[2]}-${compact[3]}`;
  }
  return null;
};

const formatDomEntryLabel = (entry: MarketDataCatalogEntry): string => {
  return (
    extractDateFromPath(entry.path) ??
    fileNameFromPath(entry.path) ??
    '—'
  );
};

const formatRelativeDuration = (value: string | null | undefined): string => {
  if (!value) {
    return '—';
  }
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    return '—';
  }
  const now = Date.now();
  if (!Number.isFinite(now)) {
    return '—';
  }
  const diffMs = now - parsed;
  if (!Number.isFinite(diffMs) || diffMs < 0) {
    return '—';
  }
  const totalSeconds = Math.floor(diffMs / 1000);
  if (totalSeconds < 60) {
    return `${totalSeconds} 秒前`;
  }
  const totalMinutes = Math.floor(totalSeconds / 60);
  if (totalMinutes < 60) {
    return `${totalMinutes} 分钟前`;
  }
  const totalHours = Math.floor(totalMinutes / 60);
  if (totalHours < 24) {
    return `${totalHours} 小时前`;
  }
  const totalDays = Math.floor(totalHours / 24);
  return `${totalDays} 天前`;
};

// 安全读取 metadata.source 字段，避免 any 类型
const getMetadataSource = (metadata: unknown): string => {
  if (metadata && typeof metadata === 'object' && !Array.isArray(metadata)) {
    const candidate = (metadata as Record<string, unknown>)['source'];
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate.trim();
    }
  }
  return '';
};

const formatOwnerId = (value: string | null | undefined): string => {
  if (!value) {
    return '';
  }
  return value;
};


type BackfillWindowUnit = 'year' | 'month';

interface BackfillWindow {
  value: number;
  unit: BackfillWindowUnit;
}

const resolveBackfillWindow = (secType: string | null | undefined): BackfillWindow => {
  const fallback: BackfillWindow = { value: 1, unit: 'year' };
  if (!secType) {
    return fallback;
  }
  const normalized = secType.trim().toUpperCase();
  if (STOCK_TYPES.has(normalized)) {
    return { value: 10, unit: 'year' };
  }
  if (FUTURES_TYPES.has(normalized)) {
    return { value: 3, unit: 'month' };
  }
  return fallback;
};

const formatBackfillWindow = (window: BackfillWindow): string => {
  const unitLabel = window.unit === 'year' ? '年' : '个月';
  return `${window.value} ${unitLabel}`;
};

const toTimeframe = (interval: string): string =>
  interval.startsWith('bar_') ? interval : `bar_${interval}`;

const formatDateInputValue = (date: Date): string => date.toISOString().slice(0, 10);

const buildDefaultBackfillRange = () => {
  const end = new Date(Date.now());
  const start = new Date(end);
  start.setUTCFullYear(end.getUTCFullYear() - 1);
  return {
    start: formatDateInputValue(start),
    end: formatDateInputValue(end)
  };
};

const toIsoRangeBoundary = (value: string, type: 'start' | 'end'): string => {
  if (!value) {
    return '';
  }
  const suffix = type === 'start' ? 'T00:00:00Z' : 'T23:59:59Z';
  return `${value}${suffix}`;
};

const buildClientIdFallbacks = (clientId: number): number[] =>
  Array.from({ length: 5 }, (_, index) => clientId + index + 1);

const describeSubscriptionTelemetry = (telemetry?: Record<string, unknown>): string => {
  if (!telemetry) {
    return '—';
  }

  const normalizeValue = (value: unknown): string | null => {
    if (typeof value === 'string') {
      const trimmed = value.trim();
      return trimmed ? trimmed : null;
    }
    if (typeof value === 'number' || typeof value === 'boolean') {
      return String(value);
    }
    return null;
  };

  const resolvePreferredKey = (key: string): string | null => normalizeValue(telemetry[key]);

  const preferred =
    resolvePreferredKey('source') ??
    resolvePreferredKey('origin') ??
    resolvePreferredKey('channel');
  if (preferred) {
    return preferred;
  }

  const MAX_LABEL_LENGTH = 80;
  const truncateSummary = (value: string): string => {
    const normalized = value.replace(/\s+/g, ' ').trim();
    if (!normalized) {
      return '—';
    }
    if (normalized.length <= MAX_LABEL_LENGTH) {
      return normalized;
    }
    return `${normalized.slice(0, MAX_LABEL_LENGTH - 1)}…`;
  };

  const fallbackKeys = ['stream', 'status', 'message'];
  for (const key of fallbackKeys) {
    const candidate = resolvePreferredKey(key);
    if (candidate) {
      return truncateSummary(candidate);
    }
  }

  return '—';
};

const normalizeValueForSerialization = (value: unknown): unknown => {
  if (value === null || value === undefined) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((entry) => normalizeValueForSerialization(entry));
  }
  if (typeof value === 'object') {
    return Object.keys(value as Record<string, unknown>)
      .sort()
      .reduce<Record<string, unknown>>((acc, key) => {
        acc[key] = normalizeValueForSerialization(
          (value as Record<string, unknown>)[key]
        );
        return acc;
      }, {});
  }
  return value;
};

const serializeRecord = (value?: Record<string, unknown> | null): string => {
  if (!value) {
    return '';
  }
  return JSON.stringify(normalizeValueForSerialization(value));
};

const areSubscribersEqual = (
  left: MarketSubscriptionStreamSubscriberPayload[],
  right: MarketSubscriptionStreamSubscriberPayload[]
): boolean => {
  if (left.length !== right.length) {
    return false;
  }
  for (let index = 0; index < left.length; index += 1) {
    const a = left[index];
    const b = right[index];
    if (
      a.ownerId !== b.ownerId ||
      a.source !== b.source ||
      a.referenceCount !== b.referenceCount ||
      a.name !== b.name ||
      a.subscribedAt !== b.subscribedAt ||
      a.pushedAt !== b.pushedAt ||
      serializeRecord(a.metadata) !== serializeRecord(b.metadata) ||
      serializeRecord(a.features as Record<string, unknown> | null) !==
        serializeRecord(b.features as Record<string, unknown> | null)
    ) {
      return false;
    }
  }
  return true;
};

const toRequestToken = (requestId: string | number | null | undefined): string => {
  if (requestId === null || requestId === undefined) {
    return '';
  }
  return typeof requestId === 'string' ? requestId : String(requestId);
};

const areStreamsEqual = (
  left: MarketSubscriptionStreamPayload[],
  right: MarketSubscriptionStreamPayload[]
): boolean => {
  if (left.length !== right.length) {
    return false;
  }
  for (let index = 0; index < left.length; index += 1) {
    const a = left[index];
    const b = right[index];
    if (
      a.streamType !== b.streamType ||
      (a.subscriptionId ?? '') !== (b.subscriptionId ?? '') ||
      (a.enabled ?? false) !== (b.enabled ?? false) ||
      (a.ownerCount ?? null) !== (b.ownerCount ?? null) ||
      (a.totalReferences ?? null) !== (b.totalReferences ?? null) ||
      toRequestToken(a.requestId ?? null) !== toRequestToken(b.requestId ?? null) ||
      serializeRecord(a.metadata) !== serializeRecord(b.metadata) ||
      serializeRecord(a.features as Record<string, unknown> | null) !==
        serializeRecord(b.features as Record<string, unknown> | null) ||
      !areSubscribersEqual(a.subscribers ?? [], b.subscribers ?? [])
    ) {
      return false;
    }
  }
  return true;
};

const areSubscriptionsEqual = (
  left: ActiveSubscriptionSummaryPayload,
  right: ActiveSubscriptionSummaryPayload
): boolean => {
  if (left === right) {
    return true;
  }
  if (left.subscriptionId !== right.subscriptionId) {
    return false;
  }
  if ((left.symbol ?? '') !== (right.symbol ?? '')) {
    return false;
  }
  if ((left.secType ?? null) !== (right.secType ?? null)) {
    return false;
  }
  return areStreamsEqual(left.streams ?? [], right.streams ?? []);
};

function MarketDataModal({ open, onClose }: MarketDataModalProps) {
  const dispatch = useAppDispatch();
  const token = useAppSelector((state) => state.auth.token);
  const [activeTab, setActiveTab] = useState<'coverage' | 'subscriptions'>('subscriptions');
  const [symbols, setSymbols] = useState<SymbolInfo[]>([]);
  const [selectedSymbol, setSelectedSymbol] = useState<string>('');
  const [coverageSelection, setCoverageSelection] = useState<CoverageSelection | null>(null);
  const [coverageEntries, setCoverageEntries] = useState<MarketDataCatalogEntry[]>([]);
  const [coverageLoading, setCoverageLoading] = useState(false);
  const [coverageLastRefreshed, setCoverageLastRefreshed] = useState<string | null>(null);
  const [directoryLoading, setDirectoryLoading] = useState(false);
  const [backfilling, setBackfilling] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [backfillCommand, setBackfillCommand] = useState<string>('');
  const [backfillPid, setBackfillPid] = useState<number | null>(null);
  const [ibClientId, setIbClientId] = useState<number>(101);
  const [backfillStartDate, setBackfillStartDate] = useState<string>('');
  const [backfillEndDate, setBackfillEndDate] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const {
    items: subscriptionItems,
    status: subscriptionStatus,
    error: subscriptionError,
    updatedAt: subscriptionUpdatedAt,
    telemetry: subscriptionTelemetry,
    streamingEnabled
  } = useAppSelector((state) => state.strategies.marketDataSubscriptions);
  const [stoppingKey, setStoppingKey] = useState<string | null>(null);
  const [resubscribingKey, setResubscribingKey] = useState<string | null>(null);
  const stopKeyFor = useCallback(
    (
      subscriptionId: string,
      streamType: MarketSubscriptionStreamType,
      ownerId?: string | null
    ) => `${subscriptionId}:${streamType}:${ownerId ?? ''}`,
    []
  );

  const applyDirectoryResult = useCallback((result: MarketDirectoryResult) => {
    setSymbols(result.symbols);
    setError(null);
  }, []);

  const refreshDirectory = useCallback(async () => {
    if (!token) {
      setError('当前会话缺少认证信息');
      return;
    }
    setDirectoryLoading(true);
    try {
      const result = await refreshMarketDirectory(token);
      applyDirectoryResult(result);
    } catch (refreshError) {
      try {
        const fallbackResult = await fetchMarketDirectory(token);
        applyDirectoryResult(fallbackResult);
      } catch (fallbackError) {
        const fallbackMessage = fallbackError instanceof Error ? fallbackError.message : null;
        const refreshMessage = refreshError instanceof Error ? refreshError.message : null;
        setError(fallbackMessage ?? refreshMessage ?? '刷新行情目录失败');
      }
    } finally {
      setDirectoryLoading(false);
    }
  }, [applyDirectoryResult, token]);

  useEffect(() => {
    if (!open) {
      return;
    }
    void refreshDirectory();
  }, [open, refreshDirectory]);

  useEffect(() => {
    if (!open) {
      return;
    }
    if (!symbols.length) {
      setSelectedSymbol('');
      return;
    }
    setSelectedSymbol((previous) => {
      if (previous && symbols.some((item) => item.symbol === previous)) {
        return previous;
      }
      return symbols[0]?.symbol ?? '';
    });
  }, [open, symbols]);

  useEffect(() => {
    if (!coverageSelection) {
      return;
    }
    const stillExists = symbols.some((item) => item.symbol === coverageSelection.symbol);
    if (stillExists) {
      return;
    }
    setCoverageSelection(null);
    setCoverageEntries([]);
    setCoverageLastRefreshed(null);
  }, [coverageSelection, symbols]);

  const currentSymbol = useMemo(
    () => symbols.find((item) => item.symbol === selectedSymbol) ?? null,
    [symbols, selectedSymbol]
  );

  const derivedBackfillWindow = useMemo(
    () => resolveBackfillWindow(currentSymbol?.secType ?? null),
    [currentSymbol?.secType]
  );

  const derivedTimeframeDescription = useMemo(() => {
    if (!currentSymbol?.secType) {
      return '默认 1 年';
    }
    const recommended = formatBackfillWindow(derivedBackfillWindow);
    return `默认 1 年（${currentSymbol.secType} 推荐：${recommended}）`;
  }, [currentSymbol?.secType, derivedBackfillWindow]);

  const sortedSymbols = useMemo(
    () => [...symbols].sort((a, b) => a.symbol.localeCompare(b.symbol)),
    [symbols]
  );

  const coverageTreeNodes = useMemo<CoverageTreeNode[]>(() => {
    const buildGroupItems = (
      groupLabel: string,
      dataType: string,
      labelBuilder: (symbol: string) => string
    ): CoverageTreeLeaf[] =>
      sortedSymbols.map((item) => {
        const detailLabel = labelBuilder(item.symbol);
        return {
          id: `${dataType}:${item.symbol}`,
          label: detailLabel,
          dataType,
          symbol: item.symbol,
          groupLabel,
          detailLabel
        };
      });

    const barIntervalNodes: CoverageTreeNode[] = BAR_TIMEFRAMES.map((timeframe) => {
      const items: CoverageTreeLeaf[] = sortedSymbols.map((item) => {
        const detailLabel = `${timeframe} · ${item.symbol}`;
        return {
          id: `bars:${timeframe}:${item.symbol}`,
          label: item.symbol,
          dataType: toTimeframe(timeframe),
          symbol: item.symbol,
          groupLabel: 'K 线',
          detailLabel
        };
      });
      return {
        id: `bars:${timeframe}`,
        label: timeframe,
        items
      };
    });

    return [
      { id: 'bars', label: 'K 线', children: barIntervalNodes },
      {
        id: 'dom',
        label: 'DOM',
        items: buildGroupItems('DOM', 'dom', (symbol) => symbol)
      },
      {
        id: 'dom_metrics',
        label: 'DOM Metrics',
        items: buildGroupItems('DOM Metrics', 'dom_metrics', (symbol) => symbol)
      }
    ];
  }, [sortedSymbols]);

  const coverageEntriesSorted = useMemo(() => {
    const withSortValue = (entry: MarketDataCatalogEntry): number => {
      const candidate = entry.end ?? entry.start;
      if (!candidate) {
        return Number.NEGATIVE_INFINITY;
      }
      const parsed = Date.parse(candidate);
      if (Number.isNaN(parsed)) {
        return Number.NEGATIVE_INFINITY;
      }
      return parsed;
    };
    return [...coverageEntries].sort((a, b) => withSortValue(b) - withSortValue(a));
  }, [coverageEntries]);

  const coverageSelectionLabel = useMemo(() => {
    if (!coverageSelection) {
      return '请选择左侧节点进行 data coverage 扫描';
    }
    return `${coverageSelection.label} · ${coverageSelection.detailLabel}`;
  }, [coverageSelection]);

  const isDomCoverage = useMemo(
    () => coverageSelection?.dataType === 'dom' || coverageSelection?.dataType === 'dom_metrics',
    [coverageSelection?.dataType]
  );

  const canRunBackfill = Boolean(coverageSelection?.dataType?.startsWith('bar_'));

  const backfillTimeframe = useMemo(() => {
    if (coverageSelection?.dataType) {
      return toTimeframe(coverageSelection.dataType);
    }
    return 'bar_1m';
  }, [coverageSelection?.dataType]);

  const backfillFallbacks = useMemo(() => {
    const normalized = Number.isFinite(ibClientId) ? Math.max(0, Math.floor(ibClientId)) : 101;
    return buildClientIdFallbacks(normalized);
  }, [ibClientId]);

  const lastRefreshedText = useMemo(
    () => formatTimestamp(coverageLastRefreshed ?? null),
    [coverageLastRefreshed]
  );

  const confirmButtonLabel = useMemo(() => {
    if (backfilling) {
      return '提交中…';
    }
    if (backfillCommand) {
      return '已触发';
    }
    return '确认';
  }, [backfillCommand, backfilling]);

  const backfillCommandPreview = useMemo(() => {
    if (backfillCommand) {
      return backfillCommand;
    }
    const symbol = coverageSelection?.symbol ?? selectedSymbol;
    if (!symbol) {
      return '';
    }
    const start = toIsoRangeBoundary(backfillStartDate, 'start') || '...';
    const end = toIsoRangeBoundary(backfillEndDate, 'end') || '...';
    return [
      'python',
      'scripts/data/run_backfill.py',
      '--direct-ib',
      '--ib-host',
      '...',
      '--ib-port',
      '...',
      '--symbol',
      symbol,
      '--timeframe',
      backfillTimeframe,
      '--start',
      start,
      '--end',
      end,
      '--ib-client-id',
      String(Math.max(0, Math.floor(ibClientId || 0)) || 101),
      '--ib-client-id-fallbacks',
      backfillFallbacks.join(','),
      '--ib-historical-timeout',
      '180',
      '--ib-request-pause',
      '10',
      '--ib-sub-span-days',
      '3',
      '--ib-retry-attempts',
      '5',
      '--ib-retry-delay',
      '10',
      '--ib-retry-backoff',
      '2',
      '--skip-if-cached',
      '--max-span-days',
      '7'
    ].join(' ');
  }, [
    backfillCommand,
    backfillEndDate,
    backfillFallbacks,
    backfillStartDate,
    backfillTimeframe,
    coverageSelection?.symbol,
    ibClientId,
    selectedSymbol
  ]);

  const previousSubscriptionsRef = useRef<ActiveSubscriptionSummaryPayload[]>(
    subscriptionItems
  );
  const memoizedSubscriptions = useMemo(() => {
    const previous = previousSubscriptionsRef.current;
    const shouldRetainPrevious =
      subscriptionStatus === 'updating' &&
      subscriptionItems.length === 0 &&
      previous.length > 0;
    if (shouldRetainPrevious) {
      return previous;
    }
    const previousById = new Map(
      previous.map((entry) => [entry.subscriptionId, entry])
    );
    const nextItems = subscriptionItems.map((entry) => {
      const previousEntry = previousById.get(entry.subscriptionId);
      if (previousEntry && areSubscriptionsEqual(previousEntry, entry)) {
        return previousEntry;
      }
      return entry;
    });
    previousSubscriptionsRef.current = nextItems;
    return nextItems;
  }, [subscriptionItems, subscriptionStatus]);

  const mergeSubscriptionLists = useCallback(
    (
      left: ActiveSubscriptionSummaryPayload[],
      right: ActiveSubscriptionSummaryPayload[]
    ): ActiveSubscriptionSummaryPayload[] => {
      const byId = new Map<string, ActiveSubscriptionSummaryPayload>();
      const push = (item: ActiveSubscriptionSummaryPayload) => {
        const existing = byId.get(item.subscriptionId);
        if (!existing) {
          byId.set(item.subscriptionId, { ...item });
          return;
        }
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
            byType.set(typeKey, { ...st, subscribers: [...(st.subscribers ?? [])] });
          } else {
            const enabled = (prev.enabled ?? false) || (st.enabled ?? false);
            const ownerCount = Math.max(prev.ownerCount ?? 0, st.ownerCount ?? 0);
            const totalReferences = Math.max(
              prev.totalReferences ?? 0,
              st.totalReferences ?? 0
            );
            const uniq = new Map<string, MarketSubscriptionStreamSubscriberPayload>();
            for (const s of [...(prev.subscribers ?? []), ...(st.subscribers ?? [])]) {
              const k = `${s.stream}|${s.ownerId}|${s.source ?? ''}`;
              if (!uniq.has(k)) uniq.set(k, s);
            }
            byType.set(typeKey, {
              ...prev,
              enabled,
              ownerCount,
              totalReferences,
              subscribers: Array.from(uniq.values())
            });
          }
        }
        merged.streams = Array.from(byType.values());
        byId.set(item.subscriptionId, merged);
      };
      for (const item of left) push(item);
      for (const item of right) push(item);
      const list = Array.from(byId.values());
      list.sort((a, b) => {
        const sym = (a.symbol ?? '').localeCompare(b.symbol ?? '');
        if (sym !== 0) return sym;
        return a.subscriptionId.localeCompare(b.subscriptionId);
      });
      return list;
    },
    []
  );

  const streamCounts = useMemo(() => {
    const counts = { dom: 0, bars: 0, ticker: 0 };
    for (const item of memoizedSubscriptions) {
      const streams = Array.isArray(item.streams) ? item.streams : [];
      for (const stream of streams) {
        if (stream.streamType === 'dom') {
          counts.dom += 1;
        } else if (stream.streamType === 'bars') {
          counts.bars += 1;
        } else if (stream.streamType === 'ticker') {
          counts.ticker += 1;
        }
      }
    }
    return counts;
  }, [memoizedSubscriptions]);

  const subscriptionRows = useMemo(() => {
    type Row = {
      key: string;
      symbol: string;
      stream: MarketSubscriptionStreamPayload;
      streamType: MarketSubscriptionStreamPayload['streamType'];
      subscriber: MarketSubscriptionStreamSubscriberPayload | null;
    };
    const rows: Row[] = [];
    const seen = new Set<string>();
    const normalizeToken = (value: string | null | undefined): string => {
      if (value == null) {
        return '';
      }
      if (typeof value === 'string') {
        return value.trim();
      }
      return String(value).trim();
    };

    const buildSubscriberKey = (
      subscriber: MarketSubscriptionStreamSubscriberPayload | null,
      stream: MarketSubscriptionStreamPayload
    ): string => {
      if (!subscriber) {
        return '__empty_subscriber__';
      }
      const subscriberSource =
        normalizeToken(subscriber.source ?? null) ||
        normalizeToken(getMetadataSource(subscriber.metadata ?? null) || '') ||
        normalizeToken(getMetadataSource(stream.metadata));
      const subscriberName = normalizeToken(subscriber.name ?? null);
      const subscriberSubscribedAt = normalizeToken(subscriber.subscribedAt ?? null);
      const subscriberStreamTag = normalizeToken(subscriber.stream ?? null);
      const tokens = [
        subscriberSource,
        subscriberName,
        subscriberSubscribedAt,
        subscriberStreamTag
      ].filter((token) => token);
      if (tokens.length === 0) {
        return '__anonymous_subscriber__';
      }
      return tokens.join('#');
    };

    for (const item of memoizedSubscriptions) {
      const streams = Array.isArray(item.streams) ? item.streams : [];
      for (const stream of streams) {
        const subscriptionIdForStream = stream.subscriptionId || item.subscriptionId;
        const requestToken = stream.requestId != null ? String(stream.requestId).trim() : '';
        if (!stream.subscribers.length) {
          const key = `${item.symbol}:${subscriptionIdForStream}:${stream.streamType}:__empty__:${requestToken}`;
          if (seen.has(key)) {
            continue;
          }
          rows.push({
            key,
            symbol: item.symbol,
            stream: { ...stream, subscriptionId: subscriptionIdForStream },
            streamType: stream.streamType,
            subscriber: null
          });
          seen.add(key);
          continue;
        }
        for (const subscriber of stream.subscribers) {
          const ownerToken = subscriber.ownerId ?? '';
          const subscriberDiscriminator = buildSubscriberKey(subscriber, stream);
          const key = `${item.symbol}:${subscriptionIdForStream}:${stream.streamType}:${ownerToken}:${requestToken}:${subscriberDiscriminator}`;
          if (seen.has(key)) {
            continue;
          }
          rows.push({
            key,
            symbol: item.symbol,
            stream: { ...stream, subscriptionId: subscriptionIdForStream },
            streamType: stream.streamType,
            subscriber
          });
          seen.add(key);
        }
      }
    }
    rows.sort((a, b) => {
      const symbolCompare = a.symbol.localeCompare(b.symbol);
      if (symbolCompare !== 0) {
        return symbolCompare;
      }
      const streamCompare = a.streamType.localeCompare(b.streamType);
      if (streamCompare !== 0) {
        return streamCompare;
      }
      const ownerA = a.subscriber?.ownerId ?? '';
      const ownerB = b.subscriber?.ownerId ?? '';
      const ownerCompare = ownerA.localeCompare(ownerB);
      if (ownerCompare !== 0) {
        return ownerCompare;
      }
      const reqA = a.stream.requestId != null ? String(a.stream.requestId) : '';
      const reqB = b.stream.requestId != null ? String(b.stream.requestId) : '';
      if (reqA !== reqB) {
        return reqA.localeCompare(reqB);
      }
      const srcA = (a.subscriber?.source ?? '') || getMetadataSource(a.stream.metadata) || '';
      const srcB = (b.subscriber?.source ?? '') || getMetadataSource(b.stream.metadata) || '';
      return String(srcA).localeCompare(String(srcB));
    });
    return rows;
  }, [memoizedSubscriptions]);

  const formatStreamLabel = useCallback((stream: MarketSubscriptionStreamPayload) => {
    let baseLabel: string;
    if (stream.streamType === 'bars') {
      baseLabel = 'Bars';
    } else if (stream.streamType === 'ticker') {
      baseLabel = 'Ticker';
    } else {
      baseLabel = 'DOM';
    }
    const requestToken =
      typeof stream.requestId === 'string'
        ? stream.requestId.trim()
        : stream.requestId != null
          ? String(stream.requestId)
          : '';
    if (requestToken) {
      return `${baseLabel}_${requestToken}`;
    }
    return baseLabel;
  }, []);

  const formatSubscriberSubscribedAt = useCallback(
    (subscriber: MarketSubscriptionStreamSubscriberPayload | null) =>
      formatRelativeDuration(subscriber?.subscribedAt ?? null),
    []
  );

  const formatSubscriberPushedAt = useCallback(
    (subscriber: MarketSubscriptionStreamSubscriberPayload | null) =>
      formatRelativeDuration(subscriber?.pushedAt ?? null),
    []
  );

  const renderSubscriberCell = useCallback(
    (subscriber: MarketSubscriptionStreamSubscriberPayload | null) => {
      if (!subscriber) {
        return '—';
      }
      return (
        <div className={styles.subscriberCell}>
          <div className={styles.subscriberOwner}>{formatOwnerId(subscriber.ownerId)}</div>
          {subscriber.name ? (
            <div className={styles.subscriberName}>{subscriber.name}</div>
          ) : null}
        </div>
      );
    },
    []
  );

  const extractStreamSource = useCallback((stream: MarketSubscriptionStreamPayload) => {
    const metadata = stream.metadata;
    if (metadata && typeof metadata === 'object' && !Array.isArray(metadata)) {
      const candidate = (metadata as Record<string, unknown>)['source'];
      if (typeof candidate === 'string' && candidate.trim()) {
        return candidate.trim();
      }
    }
    return '';
  }, []);

  const formatSubscriberSource = useCallback(
    (
      subscriber: MarketSubscriptionStreamSubscriberPayload | null,
      stream: MarketSubscriptionStreamPayload
    ) => {
      const streamSource = extractStreamSource(stream);
      const sourceToken = subscriber?.source ? subscriber.source : streamSource;
      const normalized = sourceToken.trim().toLowerCase();
      if (!normalized) {
        return '行情服务';
      }
      if (normalized === 'account-service') {
        return '账户服务';
      }
      if (normalized === 'market-data-service') {
        return '行情服务';
      }
      return sourceToken;
    },
    [extractStreamSource]
  );

  const formatReferenceCountDisplay = useCallback(
    (
      subscriber: MarketSubscriptionStreamSubscriberPayload | null,
      stream: MarketSubscriptionStreamPayload
    ) => {
      if (subscriber && subscriber.referenceCount != null) {
        return subscriber.referenceCount;
      }
      if (stream.totalReferences != null) {
        return stream.totalReferences;
      }
      if (stream.ownerCount != null) {
        return stream.ownerCount;
      }
      return '—';
    },
    []
  );

  const subscriptionStatusText = subscriptionStatus === 'updating' ? '同步中…' : '已同步';
  const subscriptionUpdatedAtLabel = useMemo(
    () => formatTimestamp(subscriptionUpdatedAt ?? null),
    [subscriptionUpdatedAt]
  );
  const subscriptionTelemetryLabel = useMemo(
    () => describeSubscriptionTelemetry(subscriptionTelemetry),
    [subscriptionTelemetry]
  );
  const subscriptionsSummaryText = useMemo(
    () =>
      `DOM ${streamCounts.dom} · Bars ${streamCounts.bars} · Ticker ${streamCounts.ticker}`,
    [streamCounts.bars, streamCounts.dom, streamCounts.ticker]
  );
  const isSubscriptionsEmpty = subscriptionRows.length === 0;
  const showSubscriptionsLoadingBanner = subscriptionStatus === 'updating';

  const refreshSubscriptions = useCallback(async () => {
    if (!token) {
      dispatch(setMarketDataSubscriptionsStatus({ status: 'idle', error: '当前会话缺少认证信息' }));
      return;
    }
    dispatch(setMarketDataSubscriptionsStatus({ status: 'updating', error: null }));
    try {
      const items = await listActiveSubscriptions(token);
      const updatedAt = new Date().toISOString();
      const merged = mergeSubscriptionLists(memoizedSubscriptions, items);
      dispatch(
        setMarketDataSubscriptions({
          items: merged,
          updatedAt,
          telemetry: { source: 'rest+strategy' },
          error: null
        })
      );
      dispatch(setMarketDataSubscriptionsStatus({ status: 'idle', error: null }));
    } catch (err) {
      const message = err instanceof Error ? err.message : '刷新订阅列表失败';
      dispatch(setMarketDataSubscriptionsStatus({ status: 'idle', error: message }));
    }
  }, [dispatch, token, memoizedSubscriptions, mergeSubscriptionLists]);

  const handleToggleStreaming = useCallback(() => {
    dispatch(setMarketDataSubscriptionsStreamingEnabled(!streamingEnabled));
  }, [dispatch, streamingEnabled]);

  useEffect(() => {
    if (!open) {
      setConfirmOpen(false);
      setBackfilling(false);
      setBackfillCommand('');
      setBackfillPid(null);
      setCoverageSelection(null);
      setCoverageEntries([]);
      setCoverageLastRefreshed(null);
      setError(null);
    }
  }, [open]);

  // 订阅列表改为手动刷新：移除自动刷新

  useEffect(() => {
    if (!confirmOpen) {
      setBackfillCommand('');
      setBackfillPid(null);
    }
  }, [confirmOpen]);

  const loadCoverageRange = useCallback(
    async (selection: CoverageSelection, refresh = false) => {
      if (!token) {
        setError('当前会话缺少认证信息');
        setCoverageEntries([]);
        setCoverageLastRefreshed(null);
        return;
      }
      setCoverageLoading(true);
      if (!refresh) {
        setCoverageEntries([]);
        setCoverageLastRefreshed(null);
      }
      try {
        const result = await fetchMarketDataRangeEntries(token, {
          symbol: selection.symbol,
          dataType: selection.dataType,
          refresh
        });
        setCoverageEntries(result.entries);
        setCoverageLastRefreshed(result.lastRefreshed);
        setError(null);
      } catch (err) {
        const message = err instanceof Error ? err.message : '获取行情覆盖范围失败';
        setError(message);
        setCoverageEntries([]);
        setCoverageLastRefreshed(null);
      } finally {
        setCoverageLoading(false);
      }
    },
    [token]
  );

  const handleCoverageSelect = useCallback(
    (selection: CoverageSelection) => {
      setCoverageSelection(selection);
      setSelectedSymbol(selection.symbol);
      void loadCoverageRange(selection);
    },
    [loadCoverageRange]
  );

  const handleCoverageRefresh = useCallback(() => {
    if (!coverageSelection) {
      return;
    }
    void loadCoverageRange(coverageSelection, true);
  }, [coverageSelection, loadCoverageRange]);

  const renderCoverageItems = useCallback(
    (items: CoverageTreeLeaf[]) => {
      if (!items.length) {
        return <div className={styles.coverageTreeEmpty}>暂无标的</div>;
      }
      return items.map((item) => {
        const isActive = coverageSelection?.nodeId === item.id;
        return (
          <button
            type="button"
            key={item.id}
            data-testid="coverageTreeSymbol"
            className={clsx(styles.coverageTreeItem, isActive && styles.coverageTreeItemActive)}
            onClick={() =>
              handleCoverageSelect({
                nodeId: item.id,
                dataType: item.dataType,
                symbol: item.symbol,
                label: item.groupLabel,
                detailLabel: item.detailLabel
              })
            }
          >
            {item.label}
          </button>
        );
      });
    },
    [coverageSelection?.nodeId, handleCoverageSelect]
  );

  const handleStopSubscription = useCallback(
    async (
      subscriptionId: string,
      symbol: string,
      streamType: MarketSubscriptionStreamType,
      ownerId?: string | null,
      source?: string | null
    ) => {
      if (!token) {
        dispatch(
          addToast({
            message: '当前会话缺少认证信息',
            variant: 'error'
          })
        );
        return;
      }
      const stopKey = stopKeyFor(subscriptionId, streamType, ownerId);
      try {
        setStoppingKey(stopKey);
        await stopMarketSubscription(token, {
          subscriptionId,
          symbol,
          ownerId: ownerId ?? null,
          source: source ?? undefined,
          streams: [streamType]
        });
        dispatch(
          addToast({
            message: `已停止订阅：${subscriptionId}`,
            variant: 'success'
          })
        );
        // Refresh current subscriptions list to reflect the change
        await refreshSubscriptions();
      } catch (err) {
        const message = err instanceof Error ? err.message : '停止订阅失败';
        dispatch(
          addToast({
            message: `停止订阅失败：${message}`,
            variant: 'error'
          })
        );
      } finally {
        setStoppingKey(null);
      }
    },
    [dispatch, stopKeyFor, token, refreshSubscriptions]
  );

  const handleResubscribe = useCallback(
    async (subscriptionId: string, symbol: string) => {
      if (!token) {
        dispatch(
          addToast({
            message: '当前会话缺少认证信息',
            variant: 'error'
          })
        );
        return;
      }
      const key = `${subscriptionId}:resubscribe`;
      try {
        setResubscribingKey(key);
        const result = await resubscribeMarketSubscriptions(token, {
          subscriptionId,
          symbol
        });
        const ok = Number.isFinite(result?.active) && Number.isFinite(result?.restarted);
        const message = ok
          ? `已重新订阅：重启 ${result.restarted ?? 0} / 活跃 ${result.active ?? 0}`
          : '已触发重新订阅';
        dispatch(
          addToast({
            message,
            variant: 'success'
          })
        );
        await refreshSubscriptions();
      } catch (err) {
        const message = err instanceof Error ? err.message : '重新订阅失败';
        dispatch(
          addToast({
            message: `重新订阅失败：${message}`,
            variant: 'error'
          })
        );
      } finally {
        setResubscribingKey(null);
      }
    },
    [dispatch, token, refreshSubscriptions]
  );

  const handleDirectoryRefresh = useCallback(() => {
    void refreshDirectory();
  }, [refreshDirectory]);

  const handleConfirmModalClose = useCallback(() => {
    if (backfilling) {
      return;
    }
    setConfirmOpen(false);
  }, [backfilling]);

  const handleBackfillConfirm = useCallback(() => {
    if (!token || !coverageSelection?.symbol || !canRunBackfill) {
      return;
    }
    const start = toIsoRangeBoundary(backfillStartDate, 'start');
    const end = toIsoRangeBoundary(backfillEndDate, 'end');
    if (!start || !end) {
      setError('请填写有效的日期范围');
      return;
    }
    const payload: Parameters<typeof requestHistoricalBackfill>[1] = {
      symbol: coverageSelection.symbol,
      timeframe: backfillTimeframe,
      start,
      end,
      ibClientId,
      ibClientIdFallbacks: backfillFallbacks
    };
    setBackfilling(true);
    setError(null);
    setBackfillCommand('');
    setBackfillPid(null);
    void requestHistoricalBackfill(token, payload)
      .then((response: HistoricalBackfillScriptResponse) => {
        dispatch(
          addToast({
            message: `已触发 ${coverageSelection.symbol} 的 run_backfill 脚本`,
            variant: 'success',
            preventDuplicates: true
          })
        );
        setBackfillCommand(response.command ?? '');
        setBackfillPid(response.pid ?? null);
        setBackfilling(false);
      })
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : '补录请求失败';
        setError(message);
        setBackfilling(false);
        dispatch(
          addToast({
            message: `补录失败：${message}`,
            variant: 'error'
          })
        );
      });
  }, [
    backfillEndDate,
    backfillFallbacks,
    backfillStartDate,
    backfillTimeframe,
    canRunBackfill,
    coverageSelection,
    dispatch,
    ibClientId,
    token
  ]);

  const handleBackfillOpen = useCallback(() => {
    if (!token || !coverageSelection?.symbol || !canRunBackfill) {
      return;
    }
    setError(null);
    setBackfillCommand('');
    setBackfillPid(null);
    const defaults = buildDefaultBackfillRange();
    setBackfillStartDate((previous) => previous || defaults.start);
    setBackfillEndDate((previous) => previous || defaults.end);
    setConfirmOpen(true);
  }, [canRunBackfill, coverageSelection, token]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="行情数据"
      subtitle="查看存档覆盖或管理实时订阅"
      size="lg"
    >
      <div className={styles.container}>
        <div className={styles.tabs}>
          <button
            type="button"
            className={activeTab === 'coverage' ? styles.tabButtonActive : styles.tabButton}
            onClick={() => setActiveTab('coverage')}
          >
            覆盖统计
          </button>
          <button
            type="button"
            className={activeTab === 'subscriptions' ? styles.tabButtonActive : styles.tabButton}
            onClick={() => setActiveTab('subscriptions')}
          >
            实时订阅
          </button>
        </div>
        {activeTab === 'coverage' ? (
          <div className={styles.controls}>
            <div className={styles.coverageIntro}>
              <div className={styles.coverageIntroTitle}>数据层级</div>
              <div className={styles.coverageIntroSubtitle}>
                选择数据类型/周期与标的后触发快速扫描。
              </div>
            </div>
            <div className={styles.buttonGroup}>
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={handleDirectoryRefresh}
                disabled={directoryLoading || !token}
              >
                {directoryLoading ? '刷新中…' : '刷新目录'}
              </button>
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={handleCoverageRefresh}
                disabled={coverageLoading || !coverageSelection}
              >
                {coverageLoading ? '扫描中…' : '快速扫描'}
              </button>
            </div>
          </div>
        ) : (
          <div className={clsx(styles.controls, styles.subsControls)}>
            <div className={styles.subsMeta} data-testid="market-data-subs-meta">
              <div className={styles.subsMetaRow}>
                <span className={styles.subsMetaLabel}>同步状态</span>
                <span className={styles.subsMetaValue} data-testid="market-data-subs-status">
                  <span
                    className={clsx(styles.subsStatusDot, {
                      [styles.subsStatusDotActive]: subscriptionStatus === 'updating'
                    })}
                  />
                  {subscriptionStatusText}
                </span>
              </div>
              <div className={styles.subsMetaRow}>
                <span className={styles.subsMetaLabel}>最近更新</span>
                <span className={styles.subsMetaValue} data-testid="market-data-subs-updated-at">
                  {subscriptionUpdatedAtLabel}
                </span>
              </div>
              <div className={styles.subsMetaRow}>
                <span className={styles.subsMetaLabel}>来源</span>
                <span className={styles.subsMetaValue} data-testid="market-data-subs-source">
                  {subscriptionTelemetryLabel}
                </span>
              </div>
              <div className={styles.subsMetaRow}>
                <span className={styles.subsMetaLabel}>订阅统计</span>
                <span className={styles.subsMetaValue} data-testid="market-data-subs-summary">
                  {subscriptionsSummaryText}
                </span>
              </div>
            </div>
            <div className={styles.buttonGroup}>
              <button
                type="button"
                className={clsx(
                  styles.streamingToggle,
                  streamingEnabled && styles.streamingToggleActive
                )}
                onClick={handleToggleStreaming}
                aria-pressed={streamingEnabled}
                data-testid="market-data-streaming-toggle"
              >
                <span
                  className={clsx(
                    styles.streamingToggleIndicator,
                    streamingEnabled
                      ? styles.streamingToggleIndicatorOn
                      : styles.streamingToggleIndicatorOff
                  )}
                />
                {streamingEnabled ? 'Streaming 模式' : '手动模式'}
              </button>
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={() => void refreshSubscriptions()}
                disabled={subscriptionStatus === 'updating' || !token}
              >
                {subscriptionStatus === 'updating' ? '同步中…' : '刷新订阅'}
              </button>
            </div>
            <div className={styles.streamingHint}>
              {streamingEnabled
                ? '已开启实时推送，订阅列表会自动更新。'
                : '已切换到手动模式，仅在点击“刷新订阅”时更新列表。'}
            </div>
          </div>
        )}
        {activeTab === 'coverage' ? (
          <>
            {error ? <div className={styles.errorBanner}>{error}</div> : null}
            <div className={styles.refreshRow}>
              <span className={styles.refreshLabel}>目录刷新时间</span>
              <span className={styles.refreshValue}>{lastRefreshedText}</span>
            </div>
            <div
              className={clsx(styles.coverageLayout, 'data-coverage-layout')}
              aria-label={DKT_DATA_COVERAGE_MODAL_LABEL}
              data-testid="dkt-data-coverage-panel"
            >
              <div className={clsx(styles.coverageTree, 'tree-pane')}>
                {coverageTreeNodes.map((node) => (
                  <div className={styles.coverageTreeGroup} key={node.id}>
                    <div className={styles.coverageTreeHeader}>{node.label}</div>
                    <div className={styles.coverageTreeList}>
                      {node.children?.length ? (
                        sortedSymbols.length ? (
                          node.children.map((child) => (
                            <div className={styles.coverageTreeChildGroup} key={child.id}>
                              <div
                                className={styles.coverageTreeChildHeader}
                                data-testid="coverageTreeInterval"
                              >
                                {child.label}
                              </div>
                              <div className={styles.coverageTreeChildList}>
                                {renderCoverageItems(child.items ?? [])}
                              </div>
                            </div>
                          ))
                        ) : (
                          <div className={styles.coverageTreeEmpty}>暂无标的</div>
                        )
                      ) : (
                        renderCoverageItems(node.items ?? [])
                      )}
                    </div>
                  </div>
                ))}
              </div>
              <div className={clsx(styles.coveragePanel, 'detail-pane')}>
                <div className={styles.coveragePanelHeader}>
                  <div className={styles.coveragePanelHeaderText}>
                    <div className={styles.coveragePanelTitle}>data coverage</div>
                    <div className={styles.coveragePanelMeta}>{coverageSelectionLabel}</div>
                    {isDomCoverage ? (
                      <div className={styles.coveragePanelHint}>
                        DOM/dom_metrics cache 目录：data/market-data/dom/&lt;symbol&gt;/ 与
                        data/market-data/dom_metrics/&lt;symbol&gt;/（YYYY/MM/DD）。右侧仅展示 cache
                        file size。
                      </div>
                    ) : null}
                  </div>
                  {canRunBackfill ? (
                    <div className={styles.coveragePanelActions}>
                      <button
                        type="button"
                        className={styles.secondaryButton}
                        onClick={handleBackfillOpen}
                        disabled={backfilling || !token}
                      >
                        Backfill
                      </button>
                    </div>
                  ) : null}
                </div>
                {coverageLoading ? (
                  <div className={styles.coverageLoading}>快速扫描中…</div>
                ) : null}
                {!coverageLoading && coverageEntriesSorted.length === 0 ? (
                  <div className={styles.coverageEmpty}>
                    {coverageSelection
                      ? '未检测到可用数据范围。'
                      : '请选择左侧节点查看覆盖范围。'}
                  </div>
                ) : null}
                {!coverageLoading && coverageEntriesSorted.length > 0 ? (
                  <div className={styles.coverageList}>
                    {coverageEntriesSorted.map((entry, index) => (
                      <div
                        className={styles.coverageRow}
                        key={`${entry.dataType}:${entry.start ?? ''}:${entry.end ?? ''}:${index}`}
                      >
                        {isDomCoverage ? (
                          <>
                            <div className={styles.coverageRowColumn}>
                              <div className={styles.coverageRangeLabel}>日期</div>
                              <div className={styles.coverageRangeValue}>
                                {formatDomEntryLabel(entry)}
                              </div>
                            </div>
                            <div className={styles.coverageRowColumn}>
                              <div className={styles.coverageRangeLabel}>file size</div>
                              <div className={styles.coverageRangeValue}>
                                {formatFileSize(entry.sizeBytes)}
                              </div>
                            </div>
                          </>
                        ) : (
                          <>
                            <div className={styles.coverageRangeLabel}>覆盖区间</div>
                            <div className={styles.coverageRangeValue}>
                              {formatTimestamp(entry.start)} ~ {formatTimestamp(entry.end)}
                            </div>
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          </>
        ) : (
          <>
            {subscriptionError ? (
              <div className={styles.errorBanner} data-testid="market-data-subs-error">
                {subscriptionError}
              </div>
            ) : null}
            {!streamingEnabled ? (
              <div className={styles.manualModeBanner} data-testid="market-data-subs-manual-banner">
                WebSocket 推送已暂停，当前表格保留最近一次刷新结果。
              </div>
            ) : null}
            {showSubscriptionsLoadingBanner ? (
              <div className={styles.subsLoading} data-testid="market-data-subs-loading">
                <span className={styles.subsLoadingSpinner} />
                同步中…
              </div>
            ) : null}
            {!subscriptionError && !showSubscriptionsLoadingBanner && isSubscriptionsEmpty ? (
              <div className={styles.subsEmpty} data-testid="market-data-subs-empty">
                当前没有实时订阅
              </div>
            ) : null}
            {!subscriptionError && !isSubscriptionsEmpty ? (
              <>
                <div className={styles.subsHeader}>
                  <div>Symbol</div>
                  <div>流类型</div>
                  <div>订阅者</div>
                  <div>来源</div>
                  <div>订阅时间</div>
                  <div>push时间</div>
                  <div>引用数</div>
                  <div className={styles.subsActions}>操作</div>
                </div>
                {subscriptionRows.map((row) => {
                  const stopKey = stopKeyFor(
                    row.stream.subscriptionId,
                    row.stream.streamType,
                    row.subscriber?.ownerId ?? null
                  );
                  return (
                    <div
                      className={styles.subsRow}
                      data-testid="market-data-subs-row"
                      key={row.key}
                    >
                      <div>{row.symbol}</div>
                      <div>{formatStreamLabel(row.stream)}</div>
                      <div>{renderSubscriberCell(row.subscriber)}</div>
                      <div>{formatSubscriberSource(row.subscriber, row.stream)}</div>
                      <div>{formatSubscriberSubscribedAt(row.subscriber)}</div>
                      <div>{formatSubscriberPushedAt(row.subscriber)}</div>
                      <div>{formatReferenceCountDisplay(row.subscriber, row.stream)}</div>
                      <div className={styles.subsActions}>
                        <button
                          type="button"
                          className={styles.secondaryButton}
                          onClick={() =>
                            handleResubscribe(
                              row.stream.subscriptionId,
                              row.symbol
                            )
                          }
                          disabled={!token || resubscribingKey === `${row.stream.subscriptionId}:resubscribe`}
                        >
                          {resubscribingKey === `${row.stream.subscriptionId}:resubscribe` ? '处理中…' : '重新订阅'}
                        </button>
                        <button
                          type="button"
                          className={styles.secondaryButton}
                          onClick={() =>
                            handleStopSubscription(
                              row.stream.subscriptionId,
                              row.symbol,
                              row.stream.streamType,
                              row.subscriber?.ownerId ?? null,
                              row.subscriber?.source ?? extractStreamSource(row.stream)
                            )
                          }
                          disabled={!row.subscriber || stoppingKey === stopKey}
                        >
                          {stoppingKey === stopKey ? '处理中…' : '取消订阅'}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </>
            ) : null}
          </>
        )}
      </div>
      <Modal
        open={confirmOpen}
        onClose={handleConfirmModalClose}
        title="确认补录请求"
        size="md"
      >
        <div className={styles.confirmContent}>
          <div className={styles.confirmMessage}>
            确认为 <span className={styles.confirmSymbol}>{coverageSelection?.symbol ?? '—'}</span> 发起
            <span className={styles.confirmHighlight}> run_backfill </span>
            历史补录？
          </div>
          <div className={styles.confirmDetails}>
            <div className={styles.confirmDetailRow}>
              <span className={styles.confirmDetailLabel}>Symbol</span>
              <span className={styles.confirmDetailValue}>{coverageSelection?.symbol ?? '—'}</span>
            </div>
            <div className={styles.confirmDetailRow}>
              <span className={styles.confirmDetailLabel}>Timeframe</span>
              <div className={styles.confirmDetailControl}>
                <span className={styles.confirmDetailValue}>{backfillTimeframe}</span>
              </div>
            </div>
            <div className={styles.confirmDetailRow}>
              <span className={styles.confirmDetailLabel}>ib-client-id</span>
              <div className={styles.confirmDetailControl}>
                <input
                  type="number"
                  min={1}
                  className={styles.confirmInput}
                  value={ibClientId}
                  onChange={(event) => setIbClientId(Number.parseInt(event.target.value, 10) || 0)}
                  disabled={backfilling}
                />
              </div>
            </div>
            <div className={styles.confirmDetailRow}>
              <span className={styles.confirmDetailLabel}>日期范围</span>
              <div className={styles.confirmDetailRange}>
                <input
                  type="date"
                  className={styles.confirmInput}
                  value={backfillStartDate}
                  onChange={(event) => setBackfillStartDate(event.target.value)}
                  disabled={backfilling}
                />
                <span className={styles.confirmDetailRangeDivider}>→</span>
                <input
                  type="date"
                  className={styles.confirmInput}
                  value={backfillEndDate}
                  onChange={(event) => setBackfillEndDate(event.target.value)}
                  disabled={backfilling}
                />
              </div>
            </div>
            <div className={styles.confirmDetailRow}>
              <span className={styles.confirmDetailLabel}>ib-client-id-fallbacks</span>
              <span className={styles.confirmDetailValue}>{backfillFallbacks.join(', ')}</span>
            </div>
            <div className={styles.confirmDetailRow}>
              <span className={styles.confirmDetailLabel}>脚本</span>
              <span className={styles.confirmDetailValue}>
                scripts/data/run_backfill.py (run_backfill)
              </span>
            </div>
            <div className={styles.confirmDetailHint}>{derivedTimeframeDescription}</div>
          </div>
          {backfillPid != null ? (
            <div className={styles.confirmDetailRow}>
              <span className={styles.confirmDetailLabel}>PID</span>
              <span className={styles.confirmDetailValue}>{backfillPid}</span>
            </div>
          ) : null}
          {backfillCommandPreview ? (
            <div className={styles.commandPreview} data-testid="backfill-command">
              {backfillCommandPreview}
            </div>
          ) : null}
          <div className={styles.confirmActions}>
            <button
              type="button"
              className={styles.confirmCancelButton}
              onClick={handleConfirmModalClose}
              disabled={backfilling}
            >
              取消
            </button>
            <button
              type="button"
              className={styles.confirmSubmitButton}
              onClick={handleBackfillConfirm}
              disabled={backfilling || !backfillStartDate || !backfillEndDate || !canRunBackfill}
            >
              {confirmButtonLabel}
            </button>
          </div>
        </div>
      </Modal>
    </Modal>
  );
}

export default MarketDataModal;

export const __TESTING__ = {
  resolveBackfillWindow,
  formatBackfillWindow,
  toTimeframe
};
