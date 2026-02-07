import type { KeyboardEvent as ReactKeyboardEvent, MouseEvent } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { formatDailyPnl, formatDailyTrades, getStrategyDailyStats } from '@features/strategies/utils/dailyStats';
import { useTranslation } from '@i18n';
import PanelCard, { PanelAction } from './PanelCard';
import StrategyPerformanceModal from '@features/strategies/components/StrategyPerformanceModal';
import styles from './StrategiesPanel.module.css';
import type {
  StrategyItem,
  StrategyMetricsSnapshot,
  StrategyPerformanceSnapshot,
  StrategyRuntimeDetail
} from '../types';
import { resolveStrategyKind, isScreenerStrategy } from '../../strategies/utils/strategyKind';
import { buildDomRuntimeMetrics, buildKlineRuntimeMetrics } from '@features/strategies/components/runtimeMetrics';
import { DEFAULT_MARKET_TIMEZONE, formatWithTimezone } from '../../../utils/timezone.js';
import { useAppDispatch, useAppSelector } from '@store/hooks';
import { resyncStrategySubscription } from '@store/thunks/strategies';
import { addToast } from '@store/slices/toastSlice';
 
import type { RequestStatus } from '@store/slices/strategiesSlice';

interface StrategiesPanelResyncController {
  statusById: Record<string, RequestStatus>;
  errorById: Record<string, string | undefined>;
  resync: (strategy: StrategyItem) => Promise<void>;
}

function useStrategiesResyncController(): StrategiesPanelResyncController {
  const dispatch = useAppDispatch();
  const subscriptionResyncStatus = useAppSelector((state) => state.strategies.subscriptionResyncStatus);
  const subscriptionResyncError = useAppSelector((state) => state.strategies.subscriptionResyncError);
  const subscriptionResyncErrorRef = useRef(subscriptionResyncError);

  useEffect(() => {
    subscriptionResyncErrorRef.current = subscriptionResyncError;
  }, [subscriptionResyncError]);

  const handleResync = useCallback<StrategiesPanelResyncController['resync']>(
    async (strategy: StrategyItem) => {
      try {
        const result = await dispatch(resyncStrategySubscription({ strategyId: strategy.id })).unwrap();
        if (result.refreshed) {
          dispatch(
            addToast({
              message: result.message ?? `${strategy.name ?? '策略'}订阅已重新同步`,
              variant: 'success',
              preventDuplicates: true
            })
          );
        } else {
          const message =
            result.message ??
            subscriptionResyncErrorRef.current?.[strategy.id] ??
            `${strategy.name ?? '策略'}订阅状态未更新，请稍后重试`;
          dispatch(
            addToast({
              message,
              variant: 'error',
              preventDuplicates: true
            })
          );
        }
      } catch (error) {
        const message =
          typeof error === 'string'
            ? error
            : error instanceof Error && error.message
            ? error.message
            : `${strategy.name ?? '策略'}订阅重新同步失败`;
        dispatch(
          addToast({
            message,
            variant: 'error',
            preventDuplicates: true
          })
        );
      }
    },
    [dispatch]
  );

  return {
    statusById: subscriptionResyncStatus,
    errorById: subscriptionResyncError,
    resync: handleResync
  };
}

interface StrategiesPanelProps {
  strategies: StrategyItem[];
  onInspect: (strategy: StrategyItem) => void;
  onEdit: (strategy: StrategyItem) => void;
  onToggle: (strategy: StrategyItem) => void;
  onCreate: () => void;
  onRefresh?: () => void;
  metricsById?: Record<string, StrategyMetricsSnapshot | null | undefined>;
  performanceById?: Record<string, StrategyPerformanceSnapshot | null | undefined>;
  runtimeById?: Record<string, StrategyRuntimeDetail | null | undefined>;
  onSelectSymbol?: (symbol: string) => void;
}

const statusClassMap: Record<StrategyItem['status'], string> = {
  running: styles.statusRunning,
  stopped: styles.statusStopped,
  error: styles.statusError,
  starting: styles.statusStarting
};

const buildStatusLabelMap = (t: (key: string) => string): Record<StrategyItem['status'], string> => ({
  running: t('dashboard_strategies.card.status.running'),
  stopped: t('dashboard_strategies.card.status.stopped'),
  error: t('dashboard_strategies.card.status.error'),
  starting: t('dashboard_strategies.card.status.starting')
});

const buildModeLabelMap = (t: (key: string) => string): Record<StrategyItem['mode'], string> => ({
  live: t('dashboard_strategies.card.mode.live'),
  paper: t('dashboard_strategies.card.mode.paper'),
  backtest: t('dashboard_strategies.card.mode.backtest')
});

const normalizeIntervalText = (value: unknown): string | null => {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return value % 60 === 0 ? `${Math.floor(value / 60)}m` : `${value}s`;
  }
  if (typeof value === 'string') {
    const text = value.trim().toLowerCase();
    if (!text) return null;
    let m = text.match(/^([0-9]+)\s*m(?:in(?:ute)?s?)?$/);
    if (m) return `${Number(m[1])}m`;
    m = text.match(/^([0-9]+)\s*s(?:ec(?:ond)?s?)?$/);
    if (m) return `${Number(m[1])}s`;
    m = text.match(/^([0-9]+)\s*h(?:our)?s?$/);
    if (m) return `${Number(m[1])}h`;
    m = text.match(/^(?:bar|candle|kline)[_\-\s]?([0-9]+)m$/);
    if (m) return `${Number(m[1])}m`;
    m = text.match(/^pt([0-9]+)m$/);
    if (m) return `${Number(m[1])}m`;
    m = text.match(/^pt([0-9]+)s$/);
    if (m) return `${Number(m[1])}s`;
    m = text.match(/^([0-9]+)$/);
    if (m) {
      const n = Number(m[1]);
      if (Number.isFinite(n) && n > 0) return n % 60 === 0 ? `${Math.floor(n / 60)}m` : `${n}s`;
    }
    m = text.match(/^([0-9]+)m$/);
    if (m) return `${Number(m[1])}m`;
    m = text.match(/^([0-9]+)s$/);
    if (m) return `${Number(m[1])}s`;
  }
  return null;
};

const normalizeIntervalList = (values: Array<unknown>): string[] => {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const normalized = normalizeIntervalText(value);
    const candidate =
      normalized ??
      (typeof value === 'string'
        ? value.trim()
        : typeof value === 'number' && Number.isFinite(value)
        ? `${value}`
        : '');
    if (!candidate) continue;
    const key = candidate.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(candidate);
  }
  return result;
};

const coerceIntervalList = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return normalizeIntervalList(value);
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return [];
    if (trimmed.startsWith('[')) {
      try {
        const parsed = JSON.parse(trimmed);
        return Array.isArray(parsed) ? normalizeIntervalList(parsed) : [];
      } catch {
        return [];
      }
    }
    const parts = trimmed.split(/[,/|]+|\s+/).map((part) => part.trim());
    return normalizeIntervalList(parts.filter(Boolean));
  }
  return [];
};

const extractIntervalsFromSubscriptions = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  const intervals: Array<unknown> = [];
  for (const entry of value) {
    if (!entry || typeof entry !== 'object') continue;
    const record = entry as Record<string, unknown>;
    const candidate =
      record.interval ??
      record.timeframe ??
      record.interval_label ??
      record.intervalLabel ??
      record.subscription_interval ??
      record.subscriptionInterval;
    if (candidate) {
      intervals.push(candidate);
    }
  }
  return normalizeIntervalList(intervals);
};

const resolveIntervalList = (options: {
  parameters?: StrategyItem['parameters'];
  runtimeSnapshot?: Record<string, unknown> | null | undefined;
  klineMetrics?: ReturnType<typeof buildKlineRuntimeMetrics> | null;
  metricsRecord?: Record<string, unknown> | undefined;
  metricsFromItem?: Record<string, unknown> | undefined;
}): string[] => {
  const runtimeSnapshot = options.runtimeSnapshot ?? null;
  const summary = runtimeSnapshot?.summary as Record<string, unknown> | undefined;
  const dataPush = runtimeSnapshot?.data_push as Record<string, unknown> | undefined;
  const subscription = runtimeSnapshot?.subscription as Record<string, unknown> | undefined;
  const paramsValue = Array.isArray(options.parameters)
    ? options.parameters.find((p) => p?.name === 'intervals')?.value
    : null;
  const listCandidates: Array<unknown> = [
    summary?.['intervals'],
    summary?.['target_intervals'],
    summary?.['subscription_intervals'],
    dataPush?.['intervals'],
    subscription?.['intervals'],
    options.metricsRecord?.['intervals'],
    options.metricsFromItem?.['intervals'],
    paramsValue
  ];
  for (const candidate of listCandidates) {
    const intervals = coerceIntervalList(candidate);
    if (intervals.length) {
      return intervals;
    }
  }
  const fromSubscriptions = extractIntervalsFromSubscriptions(runtimeSnapshot?.subscriptions);
  if (fromSubscriptions.length) {
    return fromSubscriptions;
  }
  return [];
};

function StrategiesPanel({
  strategies,
  onInspect,
  onEdit,
  onToggle,
  onCreate,
  onRefresh,
  metricsById,
  performanceById,
  runtimeById,
  onSelectSymbol
}: StrategiesPanelProps) {
  const { t } = useTranslation();
  const [performanceOpen, setPerformanceOpen] = useState<boolean>(false);
  const [selectedFilter, setSelectedFilter] = useState<'__ALL__' | 'DOM' | 'Bar' | 'AI' | 'Screener'>('__ALL__');
  const { statusById: subscriptionResyncStatus, resync } = useStrategiesResyncController();
  const statusLabelMap = buildStatusLabelMap(t);
  const modeLabelMap = buildModeLabelMap(t);
  const actions: PanelAction[] = [
    { label: t('dashboard_strategies.actions.add'), onClick: onCreate, variant: 'primary' },
    onRefresh ? { label: t('dashboard_strategies.actions.refresh'), onClick: onRefresh } : null,
    { label: '绩效', onClick: () => setPerformanceOpen(true) }
  ].filter(Boolean) as PanelAction[];

  const visibleStrategies = useMemo(() => {
    if (selectedFilter === '__ALL__') {
      return strategies;
    }
    return strategies.filter((strategy) => resolveStrategyKind(strategy) === selectedFilter);
  }, [strategies, selectedFilter]);

  const DISPLAY_LOCALE = 'zh-CN';
  const formatTimestamp = (value: string | null | undefined): string => {
    if (!value) {
      return '—';
    }
    const formatted = formatWithTimezone(
      value,
      {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      },
      DISPLAY_LOCALE,
      DEFAULT_MARKET_TIMEZONE
    );
    return formatted ?? value;
  };
  const formatPrice = (value: number | null | undefined): string => {
    if (value === null || value === undefined || Number.isNaN(value)) return '—';
    const abs = Math.abs(value);
    const maximumFractionDigits = abs >= 100 ? 0 : abs >= 10 ? 1 : abs >= 1 ? 2 : 3;
    return value.toLocaleString(DISPLAY_LOCALE, { minimumFractionDigits: 0, maximumFractionDigits });
  };

  return (
    <>
      <PanelCard
      title={t('dashboard_strategies.title')}
      actions={actions}
      headerMeta={
        <div className={styles.headerControls}>
          <div className={styles.filterTags}>
            <button
              type="button"
              className={`${styles.tag} ${selectedFilter === '__ALL__' ? styles.tagSelected : ''}`}
              onClick={() => setSelectedFilter('__ALL__')}
            >
              {t('strategies.filters.all')}
            </button>
              {['DOM', 'Bar', 'AI', 'Screener'].map((label) => (
                <button
                  key={label}
                  type="button"
                  className={`${styles.tag} ${selectedFilter === (label as 'DOM' | 'Bar' | 'AI' | 'Screener') ? styles.tagSelected : ''}`}
                  onClick={() => setSelectedFilter(label as 'DOM' | 'Bar' | 'AI' | 'Screener')}
                >
                  {label}
                </button>
              ))}
          </div>
        </div>
      }
    >
      {visibleStrategies.length === 0 ? (
        <div className={styles.empty}>{t('dashboard_strategies.empty')}</div>
      ) : (
        <div className={styles.grid}>
          {visibleStrategies.map((strategy) => {
            const statusClass = statusClassMap[strategy.status];
            const statusLabel = statusLabelMap[strategy.status];
            const isScreener = isScreenerStrategy(strategy);
            const { dailyPnl, dailyTrades } = isScreener
              ? { dailyPnl: null, dailyTrades: null }
              : getStrategyDailyStats(strategy, {
                  metrics: metricsById?.[strategy.id],
                  performance: performanceById?.[strategy.id]
                });
            const pnlClass =
              dailyPnl === null
                ? ''
                : dailyPnl >= 0
                ? styles.valuePositive
                : styles.valueNegative;

            const runtime: StrategyRuntimeDetail | null = (runtimeById?.[strategy.id] ?? null) as StrategyRuntimeDetail | null;
            const normalizedTemplateId =
              typeof strategy.templateId === 'string'
                ? strategy.templateId.trim().toLowerCase()
                : null;
            const strategyKind = resolveStrategyKind(strategy);
            const domMetricsList = strategyKind === 'DOM' ? buildDomRuntimeMetrics(runtime) : null;
            const domMetrics = (() => {
              if (!domMetricsList || !domMetricsList.length) {
                return null;
              }
              const preferredSymbol =
                typeof strategy.symbol === 'string' ? strategy.symbol.trim() : '';
              if (preferredSymbol) {
                const matched = domMetricsList.find(
                  (metrics) => (metrics.dataPushSymbol ?? '').trim() === preferredSymbol
                );
                if (matched) {
                  return matched;
                }
              }
              return domMetricsList[0];
            })();
            const klineMetrics =
              strategyKind === 'Bar'
                ? buildKlineRuntimeMetrics(runtime, normalizedTemplateId)
                : null;
            const stopLevels = (runtime?.snapshot?.stop_levels ?? null) as Record<string, unknown> | null;
            const tpRuntime = typeof stopLevels?.['take_profit_price'] === 'number' ? (stopLevels?.['take_profit_price'] as number) : null;
            const slRuntime = typeof stopLevels?.['stop_loss_price'] === 'number' ? (stopLevels?.['stop_loss_price'] as number) : null;
            const metricsRecord = metricsById?.[strategy.id]?.metrics as Record<string, unknown> | undefined;
            const metricsFromItem = strategy.metricsSnapshot?.metrics as Record<string, unknown> | undefined;
            const perfSummary = strategy.performanceSnapshot?.summary as Record<string, unknown> | undefined;
            const toNum = (v: unknown): number | null => {
              if (typeof v === 'number' && Number.isFinite(v)) return v;
              if (typeof v === 'string') {
                const n = Number(v);
                return Number.isFinite(n) ? n : null;
              }
              return null;
            };
            const tpCandidates: Array<unknown> = [
              metricsRecord?.['take_profit_price'],
              metricsRecord?.['tp_price'],
              metricsFromItem?.['take_profit_price'],
              metricsFromItem?.['tp_price'],
              perfSummary?.['take_profit_price'],
              perfSummary?.['tp_price']
            ];
            let tpFallback: number | null = null;
            for (const v of tpCandidates) {
              const num = toNum(v);
              if (num !== null) { tpFallback = num; break; }
            }
            const slCandidates: Array<unknown> = [
              metricsRecord?.['stop_loss_price'],
              metricsRecord?.['sl_price'],
              metricsFromItem?.['stop_loss_price'],
              metricsFromItem?.['sl_price'],
              perfSummary?.['stop_loss_price'],
              perfSummary?.['sl_price']
            ];
            let slFallback: number | null = null;
            for (const v of slCandidates) {
              const num = toNum(v);
              if (num !== null) { slFallback = num; break; }
            }
            const hasSubscriptionData = !!(domMetrics || klineMetrics);
            const receivingInfo = (() => {
              // Desired format: "Dom/Bar: On/Off/Linking"
              const makeLabel = (kind: 'DOM' | 'Bar' | 'AI' | 'Screener' | null): string => {
                if (kind === 'DOM') return 'Dom';
                if (kind === 'Bar') return 'Bar';
                if (kind === 'Screener') return 'Screener';
                return '';
              };

              const label = makeLabel(strategyKind);
              if (domMetrics) {
                const status: 'On' | 'Off' | 'Linking' =
                  domMetrics.isReceivingData === true
                    ? 'On'
                    : domMetrics.awaitingData
                    ? 'Linking'
                    : 'Off';
                return { label, status } as const;
              }

              if (klineMetrics) {
                const phases = klineMetrics.phases || [];
                // Check if all phases are in a healthy state (success tone)
                // We treat "active", "running", "connected" as success (mapped in runtimeMetrics)
                const allSuccess = phases.length > 0 && phases.every((p) => p.statusTone === 'success');
                const anyError = phases.some((p) => p.statusTone === 'error' || p.statusTone === 'warning');

                let status: 'On' | 'Off' | 'Linking';
                if (allSuccess) {
                  status = 'On';
                } else if (anyError) {
                  status = 'Off';
                } else {
                  status = 'Linking';
                }
                return { label, status } as const;
              }

              return { label: label || '—', status: 'Off' as const };
            })();
            const receivingStatusText = `${receivingInfo.label}: ${receivingInfo.status}`;
            const receivingStatusClass =
              receivingInfo.status === 'On'
                ? styles.runtimeStatusOn
                : receivingInfo.status === 'Off'
                ? styles.runtimeStatusOff
                : styles.runtimeStatusLinking;
            const runtimeRefreshedAt = runtime?.snapshot?.refreshedAt ?? null;
            const resyncStatus = subscriptionResyncStatus?.[strategy.id] ?? 'idle';
            const resyncPending = resyncStatus === 'loading';

            const handleRuntimeResync = async (event: MouseEvent<HTMLButtonElement>) => {
              event.stopPropagation();
              if (resyncPending) {
                return;
              }
              await resync(strategy);
            };

            const handleInspect = () => {
              onInspect(strategy);
            };

            const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
              if (event.currentTarget !== event.target) {
                return;
              }
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                handleInspect();
              }
            };

            const handleEdit = (event: MouseEvent<HTMLButtonElement>) => {
              event.stopPropagation();
              onEdit(strategy);
            };

            const handleToggle = (event: MouseEvent<HTMLButtonElement>) => {
              event.stopPropagation();
              onToggle(strategy);
            };

            const handleSymbolClick = (event: MouseEvent<HTMLButtonElement>) => {
              event.stopPropagation();
              const symbol = (strategy.symbol ?? '').trim();
              if (symbol) {
                onSelectSymbol?.(symbol);
              }
            };

            return (
              <div
                key={strategy.id}
                className={styles.card}
                onClick={handleInspect}
                onKeyDown={handleKeyDown}
                role="button"
                tabIndex={0}
              >
                <div className={styles.cardHeader}>
                  <div className={styles.titleGroup}>
                    <span className={styles.name}>{strategy.name}</span>
                    <div className={styles.meta}>
                      <button
                        type="button"
                        className={`${styles.symbol} ${styles.symbolLink}`}
                        onClick={handleSymbolClick}
                      >
                        {strategy.symbol ?? ''}
                      </button>
                      {(() => {
                            const runtimeSnapshot = runtime?.snapshot as Record<string, unknown> | null | undefined;
                            const summary = runtimeSnapshot?.summary as Record<string, unknown> | undefined;
                            const dataPush = runtimeSnapshot?.data_push as Record<string, unknown> | undefined;
                            const subscription = runtimeSnapshot?.subscription as Record<string, unknown> | undefined;
                            const metricsRecord = metricsById?.[strategy.id]?.metrics as Record<string, unknown> | undefined;
                            const metricsFromItem = strategy.metricsSnapshot?.metrics as Record<string, unknown> | undefined;
                            const intervalList = resolveIntervalList({
                              parameters: strategy.parameters,
                              runtimeSnapshot,
                              klineMetrics,
                              metricsRecord,
                              metricsFromItem
                            });
                            const fromParametersInterval = Array.isArray(strategy.parameters)
                              ? (strategy.parameters.find((p) => p?.name === 'interval')?.value as string | null)
                              : null;
                            const fromParametersTimeframe = Array.isArray(strategy.parameters)
                              ? (strategy.parameters.find((p) => p?.name === 'timeframe')?.value as string | null)
                              : null;
                            const fromParametersBarMinutes = Array.isArray(strategy.parameters)
                              ? (strategy.parameters.find((p) => p?.name === 'barMinutes' || p?.name === 'bar_minutes')?.value as number | string | null)
                              : null;
                            const fromParametersIntervalSeconds = Array.isArray(strategy.parameters)
                              ? (strategy.parameters.find((p) => p?.name === 'intervalSeconds')?.value as number | string | null)
                              : null;

                            const candidates: Array<unknown> = [
                              klineMetrics?.intervalLabel,
                              klineMetrics?.interval,
                              summary?.['interval_label'],
                              summary?.['interval'],
                              summary?.['candle_interval'],
                              summary?.['kline_interval'],
                              summary?.['timeframe'],
                              dataPush?.['interval_label'],
                              dataPush?.['interval'],
                              dataPush?.['subscription_interval'],
                              dataPush?.['timeframe'],
                              subscription?.['interval_label'],
                              subscription?.['interval'],
                              subscription?.['subscription_interval'],
                              subscription?.['timeframe'],
                              metricsRecord?.['interval_label'],
                              metricsRecord?.['interval'],
                              metricsRecord?.['candle_interval'],
                              metricsRecord?.['subscription_interval'],
                              metricsRecord?.['timeframe'],
                              metricsFromItem?.['interval_label'],
                              metricsFromItem?.['interval'],
                              metricsFromItem?.['candle_interval'],
                              metricsFromItem?.['subscription_interval'],
                              metricsFromItem?.['timeframe'],
                              fromParametersInterval,
                              fromParametersTimeframe
                            ];

                            let label: string | null = null;
                            for (const v of candidates) {
                              const normalized = normalizeIntervalText(v);
                              if (normalized) {
                                label = normalized;
                                break;
                              }
                              if (typeof v === 'string') {
                                const trimmed = v.trim();
                                if (trimmed) {
                                  label = trimmed;
                                  break;
                                }
                              }
                            }

                            if (!label) {
                              const minutesCandidates: Array<unknown> = [
                                metricsRecord?.['bar_minutes'],
                                summary?.['bar_minutes'],
                                dataPush?.['bar_minutes'],
                                subscription?.['bar_minutes'],
                                fromParametersBarMinutes,
                                metricsFromItem?.['bar_minutes']
                              ];
                              for (const mv of minutesCandidates) {
                                if (typeof mv === 'number' && Number.isFinite(mv) && mv > 0) {
                                  label = `${mv}m`;
                                  break;
                                }
                                if (typeof mv === 'string') {
                                  const trimmed = mv.trim();
                                  if (!trimmed) continue;
                                  const asNum = Number(trimmed);
                                  if (Number.isFinite(asNum) && asNum > 0) {
                                    label = `${asNum}m`;
                                    break;
                                  }
                                }
                              }
                            }

                            if (!label) {
                              const secondsCandidates: Array<unknown> = [
                                metricsRecord?.['intervalSeconds'],
                                summary?.['intervalSeconds'],
                                dataPush?.['intervalSeconds'],
                                subscription?.['intervalSeconds'],
                                fromParametersIntervalSeconds,
                                metricsFromItem?.['intervalSeconds']
                              ];
                              for (const sv of secondsCandidates) {
                                const toNum = (v: unknown): number | null => {
                                  if (typeof v === 'number' && Number.isFinite(v)) return v;
                                  if (typeof v === 'string') {
                                    const n = Number(v.trim());
                                    return Number.isFinite(n) ? n : null;
                                  }
                                  return null;
                                };
                                const val = toNum(sv);
                                if (val && val > 0) {
                                  label = val % 60 === 0 ? `${val / 60}m` : `${val}s`;
                                  break;
                                }
                              }
                            }

                            if (!label) {
                              const stageCache = (summary?.['stage_cache'] ?? summary?.['stages']) as unknown;
                              const toStageMinutes = (entry: unknown): number | null => {
                                if (!entry || typeof entry !== 'object') return null;
                                const rec = entry as Record<string, unknown>;
                                const min = rec['minutes'];
                                if (typeof min === 'number' && Number.isFinite(min) && min > 0) return min;
                                if (typeof min === 'string') {
                                  const n = Number(min.trim());
                                  return Number.isFinite(n) && n > 0 ? n : null;
                                }
                                return null;
                              };
                              if (stageCache && typeof stageCache === 'object') {
                                const entries: Array<[string, unknown]> = Object.entries(stageCache as Record<string, unknown>);
                                let candidateMinutes: number | null = null;
                                for (const [key, value] of entries) {
                                  const mv = toStageMinutes(value);
                                  if (mv && mv > 0) {
                                    candidateMinutes = mv;
                                    break;
                                  }
                                  if (typeof key === 'string') {
                                    const m = key.match(/ORB(\d+)/i);
                                    if (m && m[1]) {
                                      const num = Number(m[1]);
                                      if (Number.isFinite(num) && num > 0) {
                                        candidateMinutes = num;
                                        break;
                                      }
                                    }
                                  }
                                }
                                if (candidateMinutes && candidateMinutes > 0) {
                                  label = `${candidateMinutes}m`;
                                }
                              }
                            }

                            const badgeItems = intervalList.length ? intervalList : label ? [label] : [];
                            if (badgeItems.length) {
                              return (
                                <span className={styles.intervalBadgeGroup}>
                                  {badgeItems.map((item) => (
                                    <span key={item} className={styles.intervalBadge}>
                                      {item}
                                    </span>
                                  ))}
                                </span>
                              );
                            }
                            return (
                              <span className={styles.mode}>{modeLabelMap[strategy.mode]}</span>
                            );
                        })()}
                    </div>
                  </div>
                  <span className={`${styles.statusBadge} ${statusClass}`}>{statusLabel}</span>
                </div>
                <div className={styles.metrics}>
                  <div className={styles.metricItem}>
                    <span className={styles.metricLabel}>{t('dashboard_strategies.card.metrics.daily_pnl')}</span>
                    <span className={`${styles.metricValue} ${pnlClass}`}>
                      {formatDailyPnl(dailyPnl)}
                    </span>
                  </div>
                  <div className={styles.metricItem}>
                    <span className={styles.metricLabel}>{t('dashboard_strategies.card.metrics.daily_trades')}</span>
                    <span className={styles.metricValue}>{formatDailyTrades(dailyTrades)}</span>
                  </div>
                </div>
                <div className={styles.runtimeRow}>
                  {hasSubscriptionData && (
                    receivingInfo.status === 'Off' ? (
                      <button
                        type="button"
                        className={`${styles.runtimeLabel} ${styles.runtimeStatusButton} ${receivingStatusClass}`}
                        onClick={handleRuntimeResync}
                        disabled={resyncPending}
                      >
                        {resyncPending ? t('strategies.runtime.ui.refreshing') : receivingStatusText}
                      </button>
                    ) : (
                      <span className={`${styles.runtimeLabel} ${receivingStatusClass}`}>
                        {receivingStatusText}
                      </span>
                    )
                  )}
                  <span className={styles.runtimeTime}>@ {formatTimestamp(runtimeRefreshedAt)}</span>
                </div>
                <div className={styles.actionsRow}>
                  <div style={{ display: 'flex', flexDirection: 'column', marginRight: 'auto' }}>
                    {(() => {
                      const tp = (domMetrics?.takeProfitPrice ?? tpRuntime ?? tpFallback) ?? null;
                      const sl = (domMetrics?.stopLossPrice ?? slRuntime ?? slFallback) ?? null;
                      return (
                        <>
                          <span>
                            TP：<span className={`${styles.metricValue} ${styles.valuePositive}`}>{formatPrice(tp)}</span>
                          </span>
                          <span>
                            SL：<span className={`${styles.metricValue} ${styles.valueNegative}`}>{formatPrice(sl)}</span>
                          </span>
                        </>
                      );
                    })()}
                  </div>
                  <div className={styles.actionButtonsColumn}>
                    <button
                      type="button"
                      className={`${styles.actionButton} ${styles.subtleButton}`}
                      onClick={handleEdit}
                    >
                      {t('dashboard_strategies.card.actions.edit')}
                    </button>
                    <button
                      type="button"
                      className={`${styles.actionButton} ${styles.primaryButton}`}
                      onClick={handleToggle}
                    >
                      {strategy.status === 'running' ? t('dashboard_strategies.card.actions.stop') : t('dashboard_strategies.card.actions.start')}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
      </PanelCard>
      <StrategyPerformanceModal open={performanceOpen} onClose={() => setPerformanceOpen(false)} />
    </>
  );
}

export default StrategiesPanel;
