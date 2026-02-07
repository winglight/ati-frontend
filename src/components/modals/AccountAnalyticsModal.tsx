import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from '@i18n';
import clsx from 'clsx';
import Modal from './Modal';
import styles from './AccountAnalyticsModal.module.css';
import type {
  AccountAnalyticsPoint,
  AccountAnalyticsRange,
  AccountAnalyticsSeriesMap
} from '@features/dashboard/types';

interface AccountAnalyticsModalProps {
  open: boolean;
  onClose: () => void;
  data: AccountAnalyticsSeriesMap | null;
  currency?: string | null;
}

const RANGE_OPTIONS: Array<{ value: AccountAnalyticsRange; label: string }> = [
  { value: '1m', label: '1个月' },
  { value: '3m', label: '3个月' },
  { value: '1y', label: '1年' }
];

const CHART_WIDTH = 900;
const CHART_HEIGHT = 360;
const CHART_PADDING = { top: 32, right: 84, bottom: 48, left: 84 };

const clamp = (value: number, min: number, max: number): number => {
  if (Number.isNaN(value)) {
    return min;
  }
  return Math.min(Math.max(value, min), max);
};

const formatCurrency = (value: number, currency: string): string => {
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      maximumFractionDigits: value >= 100_000 ? 0 : 2
    }).format(value);
  } catch (_error) {
    return value.toLocaleString('en-US', { maximumFractionDigits: 0 });
  }
};

const formatCompact = (value: number, currency: string): string => {
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      notation: 'compact',
      maximumFractionDigits: 1
    }).format(value);
  } catch (_error) {
    return value.toLocaleString('en-US', { maximumFractionDigits: 1 });
  }
};

const formatPercent = (value: number): string => {
  if (!Number.isFinite(value)) {
    return '—';
  }
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}%`;
};

const getCurrencyCode = (currency?: string | null): string => {
  if (!currency) {
    return 'USD';
  }
  const trimmed = currency.trim();
  if (!trimmed) {
    return 'USD';
  }
  return trimmed.toUpperCase();
};

const createTicks = (min: number, max: number, count: number): number[] => {
  if (!Number.isFinite(min) || !Number.isFinite(max) || count <= 0) {
    return [];
  }
  if (Math.abs(max - min) < Number.EPSILON) {
    return [min];
  }
  const step = (max - min) / count;
  return Array.from({ length: count + 1 }, (_, index) => min + step * index);
};

const computeDrawdown = (points: AccountAnalyticsPoint[]): number => {
  let peak = Number.NEGATIVE_INFINITY;
  let maxDrawdown = 0;
  for (const point of points) {
    peak = Math.max(peak, point.equity);
    const drawdown = peak > 0 ? (point.equity - peak) / peak : 0;
    if (drawdown < maxDrawdown) {
      maxDrawdown = drawdown;
    }
  }
  return maxDrawdown;
};

const toDisplayDate = (value: string): string => {
  try {
    return new Date(value).toLocaleDateString('zh-CN', {
      month: 'short',
      day: 'numeric'
    });
  } catch (_error) {
    return value;
  }
};

const buildLinePath = (
  points: AccountAnalyticsPoint[],
  accessor: (point: AccountAnalyticsPoint) => number,
  scaleX: (index: number) => number,
  scaleY: (value: number) => number
): string => {
  return points
    .map((point, index) => {
      const x = scaleX(index);
      const y = scaleY(accessor(point));
      const command = index === 0 ? 'M' : 'L';
      return `${command}${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(' ');
};

const buildAreaPath = (
  linePath: string,
  points: AccountAnalyticsPoint[],
  scaleX: (index: number) => number,
  baseline: number
): string => {
  if (!points.length || !linePath) {
    return '';
  }
  const lastX = scaleX(points.length - 1).toFixed(2);
  const firstX = scaleX(0).toFixed(2);
  return `${linePath} L${lastX},${baseline.toFixed(2)} L${firstX},${baseline.toFixed(2)} Z`;
};

function AccountAnalyticsModal({ open, onClose, data, currency }: AccountAnalyticsModalProps) {
  const currencyCode = getCurrencyCode(currency);
  const [range, setRange] = useState<AccountAnalyticsRange>('1m');

  useEffect(() => {
    if (open) {
      setRange('1m');
    }
  }, [open]);

  const currentPoints = useMemo(() => {
    if (!data) {
      return [] as AccountAnalyticsPoint[];
    }
    return data[range] ?? [];
  }, [data, range]);

  const chartMetrics = useMemo(() => {
    if (!currentPoints.length) {
      return null;
    }

    const innerWidth = CHART_WIDTH - CHART_PADDING.left - CHART_PADDING.right;
    const innerHeight = CHART_HEIGHT - CHART_PADDING.top - CHART_PADDING.bottom;

    const equityValues = currentPoints.map((point) => point.equity);
    const pnlValues = currentPoints.map((point) => point.pnl);

    const equityMin = Math.min(...equityValues);
    const equityMax = Math.max(...equityValues);
    const pnlMin = Math.min(...pnlValues, 0);
    const pnlMax = Math.max(...pnlValues, 0);

    const scaleX = (index: number) => {
      if (currentPoints.length <= 1) {
        return CHART_PADDING.left + innerWidth / 2;
      }
      const ratio = index / (currentPoints.length - 1);
      return CHART_PADDING.left + ratio * innerWidth;
    };

    const scaleEquity = (value: number) => {
      if (!Number.isFinite(value) || equityMax === equityMin) {
        return CHART_PADDING.top + innerHeight / 2;
      }
      const ratio = (value - equityMin) / (equityMax - equityMin);
      return CHART_PADDING.top + innerHeight - clamp(ratio, 0, 1) * innerHeight;
    };

    const scalePnl = (value: number) => {
      if (!Number.isFinite(value) || pnlMax === pnlMin) {
        return CHART_PADDING.top + innerHeight / 2;
      }
      const ratio = (value - pnlMin) / (pnlMax - pnlMin);
      return CHART_PADDING.top + innerHeight - clamp(ratio, 0, 1) * innerHeight;
    };

    const equityPath = buildLinePath(currentPoints, (point) => point.equity, scaleX, scaleEquity);
    const pnlPath = buildLinePath(currentPoints, (point) => point.pnl, scaleX, scalePnl);
    const equityArea = buildAreaPath(equityPath, currentPoints, scaleX, CHART_PADDING.top + innerHeight);

    const equityTicks = createTicks(equityMin, equityMax, 4);
    const pnlTicks = createTicks(pnlMin, pnlMax, 4);

    const tickCount = Math.min(6, currentPoints.length - 1);
    const xTickIndexes = tickCount > 0
      ? Array.from({ length: tickCount + 1 }, (_, index) => Math.round((index / tickCount) * (currentPoints.length - 1)))
      : [0];

    const pnlZero = Number.isFinite(pnlMin) && Number.isFinite(pnlMax) ? scalePnl(0) : null;

    return {
      equityPath,
      pnlPath,
      equityArea,
      scaleX,
      scaleEquity,
      scalePnl,
      equityTicks,
      pnlTicks,
      xTickIndexes,
      pnlZero,
      equityMin,
      equityMax,
      pnlMin,
      pnlMax
    };
  }, [currentPoints]);

  const summaryMetrics = useMemo(() => {
    if (!currentPoints.length) {
      return null;
    }
    const firstPoint = currentPoints[0];
    const lastPoint = currentPoints[currentPoints.length - 1];
    const equityChange = lastPoint.equity - firstPoint.equity;
    const equityChangePct = firstPoint.equity !== 0 ? (equityChange / firstPoint.equity) * 100 : 0;
    const totalPnl = currentPoints.reduce((sum, point) => sum + point.pnl, 0);
    const averageDailyPnl = totalPnl / Math.max(currentPoints.length, 1);
    const maxDrawdown = computeDrawdown(currentPoints);

    return {
      firstPoint,
      lastPoint,
      equityChange,
      equityChangePct,
      totalPnl,
      averageDailyPnl,
      maxDrawdown
    };
  }, [currentPoints]);

  const { t } = useTranslation();

  return (
    <Modal open={open} onClose={onClose} title={t('modals.account_analytics.title')} size="lg">
      <div className={styles.container}>
        <div className={styles.rangeSelector}>
          {RANGE_OPTIONS.map((option) => {
            const hasData = Boolean(data?.[option.value]?.length);
            return (
              <button
                key={option.value}
                type="button"
                className={clsx(
                  styles.rangeButton,
                  range === option.value && styles.rangeButtonActive,
                  !hasData && styles.rangeButtonDisabled
                )}
                disabled={!hasData}
                onClick={() => setRange(option.value)}
              >
                {t(`modals.account_analytics.range.${option.value}`)}
              </button>
            );
          })}
        </div>

        <div className={styles.chartWrapper}>
          <div className={styles.chartScroll}>
            {currentPoints.length && chartMetrics ? (
              <svg
                className={styles.chart}
                viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
                role="img"
                aria-label={t('modals.account_analytics.chart_aria_label')}
              >
                <defs>
                  <linearGradient id="equity-fill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="rgba(59, 130, 246, 0.35)" />
                    <stop offset="100%" stopColor="rgba(59, 130, 246, 0.02)" />
                  </linearGradient>
                </defs>

                <rect
                  x={CHART_PADDING.left}
                  y={CHART_PADDING.top}
                  width={CHART_WIDTH - CHART_PADDING.left - CHART_PADDING.right}
                  height={CHART_HEIGHT - CHART_PADDING.top - CHART_PADDING.bottom}
                  fill="rgba(241, 245, 249, 0.85)"
                  rx={18}
                />

                {chartMetrics.equityTicks.map((tick) => (
                  <g key={`e-tick-${tick}`}>
                    <line
                      className={styles.gridLine}
                      x1={CHART_PADDING.left}
                      x2={CHART_WIDTH - CHART_PADDING.right}
                      y1={chartMetrics.scaleEquity(tick)}
                      y2={chartMetrics.scaleEquity(tick)}
                    />
                    <text
                      className={styles.tickLabel}
                      x={CHART_PADDING.left - 12}
                      y={chartMetrics.scaleEquity(tick) + 4}
                      textAnchor="end"
                    >
                      {formatCompact(tick, currencyCode)}
                    </text>
                  </g>
                ))}

                {chartMetrics.pnlTicks.map((tick) => (
                  <g key={`p-tick-${tick}`}>
                    <text
                      className={styles.tickLabel}
                      x={CHART_WIDTH - CHART_PADDING.right + 12}
                      y={chartMetrics.scalePnl(tick) + 4}
                      textAnchor="start"
                    >
                      {formatCompact(tick, currencyCode)}
                    </text>
                  </g>
                ))}

                {chartMetrics.pnlZero !== null ? (
                  <line
                    className={styles.pnlZeroLine}
                    x1={CHART_PADDING.left}
                    x2={CHART_WIDTH - CHART_PADDING.right}
                    y1={chartMetrics.pnlZero}
                    y2={chartMetrics.pnlZero}
                  />
                ) : null}

                <path d={chartMetrics.equityArea} fill="url(#equity-fill)" stroke="none" />
                <path
                  d={chartMetrics.equityPath}
                  fill="none"
                  stroke="rgba(56, 189, 248, 0.9)"
                  strokeWidth={2.5}
                />
                {currentPoints.map((point, index) => {
                  const x = chartMetrics.scaleX(index);
                  return (
                    <circle
                      key={`equity-point-${point.date}`}
                      cx={x}
                      cy={chartMetrics.scaleEquity(point.equity)}
                      r={4.5}
                      fill="#ffffff"
                      stroke="rgba(56, 189, 248, 0.9)"
                      strokeWidth={2}
                    />
                  );
                })}
                <path
                  d={chartMetrics.pnlPath}
                  fill="none"
                  stroke="rgba(248, 113, 113, 0.9)"
                  strokeWidth={2}
                  strokeDasharray="4 4"
                />
                {currentPoints.map((point, index) => {
                  const x = chartMetrics.scaleX(index);
                  return (
                    <circle
                      key={`pnl-point-${point.date}`}
                      cx={x}
                      cy={chartMetrics.scalePnl(point.pnl)}
                      r={3.5}
                      fill="#ffffff"
                      stroke="rgba(248, 113, 113, 0.9)"
                      strokeWidth={1.8}
                    />
                  );
                })}

                {chartMetrics.xTickIndexes.map((index) => {
                  const point = currentPoints[index];
                  const x = chartMetrics.scaleX(index);
                  return (
                    <g key={`x-tick-${point.date}`}>
                      <line
                        className={styles.referenceLine}
                        x1={x}
                        x2={x}
                        y1={CHART_PADDING.top}
                        y2={CHART_HEIGHT - CHART_PADDING.bottom}
                      />
                      <text
                        className={styles.tickLabel}
                        x={x}
                        y={CHART_HEIGHT - CHART_PADDING.bottom + 20}
                        textAnchor="middle"
                      >
                        {toDisplayDate(point.date)}
                      </text>
                    </g>
                  );
                })}

                <text
                  className={styles.axisLabel}
                  x={CHART_PADDING.left}
                  y={CHART_PADDING.top - 12}
                  textAnchor="start"
                >
                  {t('modals.account_analytics.axis.equity', { currency: currencyCode })}
                </text>
                <text
                  className={styles.axisLabel}
                  x={CHART_WIDTH - CHART_PADDING.right}
                  y={CHART_PADDING.top - 12}
                  textAnchor="end"
                >
                  {t('modals.account_analytics.axis.pnl', { currency: currencyCode })}
                </text>
              </svg>
            ) : (
              <div className={styles.emptyState}>{t('modals.account_analytics.empty')}</div>
            )}
          </div>
        </div>

        <div className={styles.legend}>
          <div className={styles.legendItem}>
            <span className={styles.legendSwatch} style={{ background: 'rgba(56, 189, 248, 0.9)' }} />
            <span>{t('modals.account_analytics.legend.equity')}</span>
          </div>
          <div className={styles.legendItem}>
            <span className={styles.legendSwatch} style={{ background: 'rgba(248, 113, 113, 0.9)' }} />
            <span>{t('modals.account_analytics.legend.pnl')}</span>
          </div>
        </div>

        {summaryMetrics ? (
          <div className={styles.metrics}>
            <div className={styles.metricCard}>
              <span className={styles.metricLabel}>{t('modals.account_analytics.metrics.equity_change')}</span>
              <span className={styles.metricValue}>{formatCurrency(summaryMetrics.lastPoint.equity, currencyCode)}</span>
              <span
                className={clsx(
                  styles.metricDelta,
                  summaryMetrics.equityChange < 0 && styles.metricDeltaNegative
                )}
              >
                {`${summaryMetrics.equityChange < 0 ? '' : '+'}${formatCurrency(summaryMetrics.equityChange, currencyCode)} · ${formatPercent(summaryMetrics.equityChangePct)}`}
              </span>
            </div>
            <div className={styles.metricCard}>
              <span className={styles.metricLabel}>{t('modals.account_analytics.metrics.pnl_change')}</span>
              <span className={styles.metricValue}>{formatCurrency(summaryMetrics.totalPnl, currencyCode)}</span>
              <span
                className={clsx(
                  styles.metricDelta,
                  summaryMetrics.totalPnl < 0 && styles.metricDeltaNegative
                )}
              >
                {`${summaryMetrics.totalPnl < 0 ? '' : '+'}${formatCurrency(summaryMetrics.totalPnl, currencyCode)}`}
              </span>
            </div>
            <div className={styles.metricCard}>
              <span className={styles.metricLabel}>{t('modals.account_analytics.metrics.avg_daily_pnl')}</span>
              <span className={styles.metricValue}>{formatCurrency(summaryMetrics.averageDailyPnl, currencyCode)}</span>
              <span className={styles.metricDelta}>{t(`modals.account_analytics.metrics.avg_daily_pnl_delta.${range}`)}</span>
            </div>
            <div className={styles.metricCard}>
              <span className={styles.metricLabel}>{t('modals.account_analytics.metrics.max_drawdown')}</span>
              <span className={styles.metricValue}>{formatPercent(summaryMetrics.maxDrawdown * 100)}</span>
              <span className={styles.metricDelta}>{t('modals.account_analytics.metrics.max_drawdown_hint')}</span>
            </div>
          </div>
        ) : null}
      </div>
    </Modal>
  );
}

export default AccountAnalyticsModal;
