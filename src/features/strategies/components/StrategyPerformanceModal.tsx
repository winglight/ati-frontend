import { useCallback, useMemo, useState } from 'react';
import Modal from '../../../components/modals/Modal';
import styles from './StrategyPerformanceModal.module.css';
import { useAppSelector } from '@store/hooks';
import { fetchStrategiesPerformanceEvaluate } from '@services/strategyApi';
import type { StrategyItem } from '@features/dashboard/types';
import { buildZonedDate, formatDateKey, getLocalTimezone, getZonedDateParts } from '../utils/dateAggregation';
import { isScreenerStrategy } from '../utils/strategyKind';

interface StrategyPerformanceModalProps {
  open: boolean;
  onClose: () => void;
  anchorStrategy?: StrategyItem | null;
}

type ViewMode = 'table' | 'chart';
type MetricKey = 'pnl' | 'commission' | 'trades' | 'winRate' | 'maxDrawdown' | 'sharpe' | 'avgDurationSeconds';
type ChartGroupId = 'ability' | 'risk' | 'activity';

interface AggregatedMetrics {
  id: string;
  name: string;
  symbol: string;
  pnl: number;
  commission: number;
  trades: number;
  winRate: number;
  maxDrawdown: number;
  sharpe: number;
  avgDurationSeconds: number | null;
}

const toIsoDate = (d: Date | string, timezone: string) => formatDateKey(d, timezone);

const formatDuration = (value: number | null | undefined): string => {
  if (value === null || value === undefined) {
    return '—';
  }
  const parsed = typeof value === 'string' ? Number(value) : value;
  if (!Number.isFinite(parsed as number)) {
    return String(value);
  }
  const v = parsed as number;
  if (v <= 0) {
    return '0 秒';
  }
  const hours = Math.floor(v / 3600);
  const minutes = Math.floor((v % 3600) / 60);
  const seconds = Math.floor(v % 60);
  const parts: string[] = [];
  if (hours) parts.push(`${hours} 小时`);
  if (minutes) parts.push(`${minutes} 分钟`);
  if (seconds || !parts.length) parts.push(`${seconds} 秒`);
  return parts.join(' ');
};

export default function StrategyPerformanceModal({
  open,
  onClose,
  anchorStrategy
}: StrategyPerformanceModalProps) {
  const strategies = useAppSelector((state) => state.strategies.items);
  const authToken = useAppSelector((state) => state.auth.token);
   
  const localTimezone = useMemo(() => getLocalTimezone(), []);

  const [startDate, setStartDate] = useState<string>(() => toIsoDate(new Date(), localTimezone));
  const [endDate, setEndDate] = useState<string>(() => toIsoDate(new Date(), localTimezone));
  const [view, setView] = useState<ViewMode>('table');
  const [metrics, setMetrics] = useState<Record<string, AggregatedMetrics>>({});
  const [loading, setLoading] = useState<boolean>(false);
  const [sortKey, setSortKey] = useState<keyof AggregatedMetrics>('pnl');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [chartKey, _setChartKey] = useState<MetricKey>('pnl');
  const [chartType, setChartType] = useState<'bar' | 'line'>('bar');
  const [chartGroup, setChartGroup] = useState<ChartGroupId>('ability');

  const anchorId = anchorStrategy?.id ?? null;

  const visibleStrategies = useMemo(() => {
    if (anchorId) {
      const anchor = strategies.find((s) => s.id === anchorId);
      if (!anchor) return strategies;
      return strategies;
    }
    return strategies;
  }, [strategies, anchorId]);

  const handleQuick = useCallback((preset: string) => {
    const nowParts = getZonedDateParts(new Date(), localTimezone);
    const now = buildZonedDate(
      { year: nowParts.year, month: nowParts.month - 1, date: nowParts.day },
      localTimezone
    );
    const addDays = (value: Date, days: number) => new Date(value.getTime() + days * 24 * 60 * 60 * 1000);
    let s = now;
    let e = now;
    switch (preset) {
      case 'this-day':
        s = now;
        e = now;
        break;
      case 'this-week':
        {
          const weekday = new Date(Date.UTC(nowParts.year, nowParts.month - 1, nowParts.day)).getUTCDay();
          const offset = weekday === 0 ? -6 : 1 - weekday;
          s = addDays(now, offset);
          e = now;
        }
        break;
      case 'this-month':
        s = buildZonedDate({ year: nowParts.year, month: nowParts.month - 1, date: 1 }, localTimezone);
        e = now;
        break;
      case 'this-year':
        s = buildZonedDate({ year: nowParts.year, month: 0, date: 1 }, localTimezone);
        e = now;
        break;
      case 'one-week':
        s = addDays(now, -7);
        break;
      case 'one-month':
        {
          const temp = new Date(now);
          temp.setUTCMonth(temp.getUTCMonth() - 1);
          s = temp;
        }
        break;
      case 'to-this-day':
        s = buildZonedDate({ year: 2000, month: 0, date: 1 }, localTimezone);
        e = now;
        break;
      default:
        break;
    }
    setStartDate(toIsoDate(s, localTimezone));
    setEndDate(toIsoDate(e, localTimezone));
  }, [localTimezone]);

  const evaluate = useCallback(async () => {
    setLoading(true);
    try {
      const ids = visibleStrategies
        .filter((s) => !isScreenerStrategy(s))
        .map((s) => s.id);

      if (ids.length === 0) {
        setLoading(false);
        return;
      }

      const payload = await fetchStrategiesPerformanceEvaluate(
        authToken as string,
        {
          startDate: `${startDate}T00:00:00Z`,
          endDate: `${endDate}T23:59:59Z`,
          strategyIds: ids as Array<string | number>
        }
      );
      const next: Record<string, AggregatedMetrics> = {};
      for (const entry of payload.strategies || []) {
        const id = String(entry.id ?? entry.strategy_id ?? '');
        const s = strategies.find((x) => String(x.id) === id);
        const name = s?.name ?? (entry.name ?? id);
        const symbol = s?.symbol ?? (entry.symbol ?? '');
        const summary = entry.summary || {};
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const toNum = (v: any): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
        next[id] = {
          id,
          name,
          symbol,
          pnl: toNum(summary.total_pnl),
          commission: toNum(summary.commission_total ?? summary.total_commission),
          trades: toNum(summary.trade_count),
          winRate: toNum(summary.win_rate),
          maxDrawdown: toNum(summary.max_drawdown),
          sharpe: toNum(summary.sharpe_ratio ?? summary.sharpe),
          avgDurationSeconds: typeof summary.avg_trade_duration_seconds === 'number' ? summary.avg_trade_duration_seconds : null
        } as AggregatedMetrics;
      }
      setMetrics(next);
    } catch (e) {
      void e;
      const next: Record<string, AggregatedMetrics> = {};
      for (const s of visibleStrategies) {
        if (isScreenerStrategy(s)) continue;
        next[s.id] = {
          id: s.id,
          name: s.name,
          symbol: s.symbol,
          pnl: 0,
          commission: 0,
          trades: 0,
          winRate: 0,
          maxDrawdown: 0,
          sharpe: 0,
          avgDurationSeconds: null
        };
      }
      setMetrics(next);
    }
    setLoading(false);
  }, [visibleStrategies, startDate, endDate, strategies, authToken]);

  const rows = useMemo(() => {
    const list = Object.values(metrics);
    const sorted = list.sort((a, b) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const va = (a as any)[sortKey] ?? 0;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const vb = (b as any)[sortKey] ?? 0;
      const na = typeof va === 'number' ? va : 0;
      const nb = typeof vb === 'number' ? vb : 0;
      return sortDir === 'asc' ? na - nb : nb - na;
    });
    return sorted;
  }, [metrics, sortKey, sortDir]);

  const columnMax = useMemo(() => {
    const values = Object.values(metrics);
    const pick = (k: keyof AggregatedMetrics) => Math.max(...values.map((m) => {
      const v = m[k];
      return typeof v === 'number' ? v : 0;
    }), 0);
    return {
      id: 0,
      name: 0,
      symbol: 0,
      pnl: pick('pnl'),
      commission: pick('commission'),
      winRate: pick('winRate'),
      maxDrawdown: pick('maxDrawdown'),
      sharpe: pick('sharpe'),
      trades: pick('trades'),
      avgDurationSeconds: pick('avgDurationSeconds'),
    } as unknown as Record<keyof AggregatedMetrics, number>;
  }, [metrics]);

  const maxForChart = useMemo(() => {
    const list = Object.values(metrics);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const values = list.map((m) => (typeof (m as any)[chartKey] === 'number' ? ((m as any)[chartKey] as number) : 0));
    return Math.max(...values, 0);
  }, [metrics, chartKey]);

  const minForChart = useMemo(() => {
    const list = Object.values(metrics);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const values = list.map((m) => (typeof (m as any)[chartKey] === 'number' ? ((m as any)[chartKey] as number) : 0));
    return Math.min(...values, 0);
  }, [metrics, chartKey]);

  const metricLabels: Record<MetricKey, string> = useMemo(() => ({
    pnl: '收益',
    commission: '佣金',
    trades: '交易次数',
    winRate: '胜率',
    maxDrawdown: '最大回撤',
    sharpe: '夏普',
    avgDurationSeconds: '平均持续时长'
  }), []);

  const CHART_GROUPS: Array<{ id: ChartGroupId; title: string; keys: MetricKey[] }> = useMemo(() => ([
    { id: 'ability', title: '收益能力', keys: ['pnl', 'sharpe', 'winRate'] },
    { id: 'risk', title: '风险', keys: ['maxDrawdown', 'commission'] },
    { id: 'activity', title: '活跃度', keys: ['trades', 'avgDurationSeconds'] }
  ]), []);

  const currentGroup = useMemo(() => CHART_GROUPS.find((g) => g.id === chartGroup) ?? CHART_GROUPS[0], [CHART_GROUPS, chartGroup]);

  const groupStats = useMemo(() => {
    const values = Object.values(metrics);
    const maxByKey: Record<MetricKey, number> = {
      pnl: 0,
      commission: 0,
      trades: 0,
      winRate: 0,
      maxDrawdown: 0,
      sharpe: 0,
      avgDurationSeconds: 0
    };
    const minByKey: Record<MetricKey, number> = {
      pnl: 0,
      commission: 0,
      trades: 0,
      winRate: 0,
      maxDrawdown: 0,
      sharpe: 0,
      avgDurationSeconds: 0
    };
    for (const key of currentGroup.keys) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const arr = values.map((m) => (typeof (m as any)[key] === 'number' ? ((m as any)[key] as number) : 0));
      maxByKey[key] = Math.max(...arr, 0);
      minByKey[key] = Math.min(...arr, 0);
    }
    return { maxByKey, minByKey } as const;
  }, [metrics, currentGroup]);

  return (
    <Modal open={open} onClose={onClose} title="策略绩效对比" variant="frameless">
      <div className={styles.container}>
        <div className={styles.header}>
          <div className={styles.title}>日期范围与评估</div>
          <div className={styles.toolbar}>
            <div className={styles.dateInputs}>
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
              <span>—</span>
              <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
            <div className={styles.quickButtons}>
              <button className={styles.button} onClick={() => handleQuick('this-day')}>This Day</button>
              <button className={styles.button} onClick={() => handleQuick('this-week')}>This Week</button>
              <button className={styles.button} onClick={() => handleQuick('this-month')}>This Month</button>
              <button className={styles.button} onClick={() => handleQuick('this-year')}>This Year</button>
              <button className={styles.button} onClick={() => handleQuick('one-week')}>One Week</button>
              <button className={styles.button} onClick={() => handleQuick('one-month')}>One Month</button>
              <button className={styles.button} onClick={() => handleQuick('to-this-day')}>To This Day</button>
            </div>
            <button className={`${styles.button} ${styles.buttonPrimary}`} onClick={evaluate} disabled={loading}>评估</button>
            <div className={styles.views}>
              <button className={`${styles.viewTab} ${view === 'table' ? styles.viewActive : ''}`} onClick={() => setView('table')}>表格</button>
              <button className={`${styles.viewTab} ${view === 'chart' ? styles.viewActive : ''}`} onClick={() => setView('chart')}>图表</button>
            </div>
          </div>
        </div>
        <div className={styles.content}>
          {view === 'table' ? (
            <table className={styles.table}>
              <thead>
                <tr>
                  <th className={styles.th}>策略</th>
                  <th className={styles.th} onClick={() => setSortKey('pnl')}>PnL</th>
                  <th className={styles.th} onClick={() => setSortKey('commission')}>Commission</th>
                  <th className={styles.th} onClick={() => setSortKey('winRate')}>Win Rate</th>
                  <th className={styles.th} onClick={() => setSortKey('maxDrawdown')}>Max DD</th>
                  <th className={styles.th} onClick={() => setSortKey('sharpe')}>Sharpe</th>
                  <th className={styles.th} onClick={() => setSortKey('trades')}>Trades</th>
                  <th className={styles.th} onClick={() => setSortKey('avgDurationSeconds')}>Avg Duration</th>
                  <th className={styles.th}>
                    <button className={styles.button} onClick={() => setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))}>
                      {sortDir === 'asc' ? '升序' : '降序'}
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((m) => (
                  <tr key={m.id}>
                    <td className={styles.td}>{m.name} / {m.symbol}</td>
                    <td className={`${styles.td} ${m.pnl === columnMax.pnl ? styles.maxCell : ''}`}>{m.pnl.toFixed(2)}</td>
                    <td className={`${styles.td} ${m.commission === columnMax.commission ? styles.maxCell : ''}`}>{m.commission.toFixed(2)}</td>
                    <td className={`${styles.td} ${m.winRate === columnMax.winRate ? styles.maxCell : ''}`}>{(m.winRate * 100).toFixed(1)}%</td>
                    <td className={`${styles.td} ${m.maxDrawdown === columnMax.maxDrawdown ? styles.maxCell : ''}`}>{m.maxDrawdown.toFixed(2)}</td>
                    <td className={`${styles.td} ${m.sharpe === columnMax.sharpe ? styles.maxCell : ''}`}>{m.sharpe.toFixed(2)}</td>
                    <td className={`${styles.td} ${m.trades === columnMax.trades ? styles.maxCell : ''}`}>{m.trades}</td>
                    <td className={`${styles.td} ${((m.avgDurationSeconds ?? 0) === columnMax.avgDurationSeconds) ? styles.maxCell : ''}`}>{formatDuration(m.avgDurationSeconds)}</td>
                    <td className={styles.td}></td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            (() => {
              const items = rows;
              const width = 1024;
              const height = Math.max(320, 240);
              const padding = { left: 68, right: 180, top: 42, bottom: 54 };
              const innerWidth = width - padding.left - padding.right;
              const innerHeight = height - padding.top - padding.bottom;
              const maxAbs = Math.max(Math.abs(maxForChart), Math.abs(minForChart));
              const ticks = (() => {
                const base = chartType === 'bar'
                  ? [0, maxAbs * 0.25, maxAbs * 0.5, maxAbs * 0.75, maxAbs]
                  : [minForChart, minForChart + (maxForChart - minForChart) * 0.25, minForChart + (maxForChart - minForChart) * 0.5, minForChart + (maxForChart - minForChart) * 0.75, maxForChart];
                return base.map((v) => Math.round(v * 100) / 100);
              })();
              const formatValue = (v: number) => {
                if (chartKey === 'winRate') return `${(v * 100).toFixed(1)}%`;
                if (chartKey === 'avgDurationSeconds') {
                  const n = Math.round(v);
                  if (n <= 0) return '0秒';
                  const h = Math.floor(n / 3600);
                  const m = Math.floor((n % 3600) / 60);
                  const s = Math.floor(n % 60);
                  const parts: string[] = [];
                  if (h) parts.push(`${h}小时`);
                  if (m) parts.push(`${m}分钟`);
                  if (s || !parts.length) parts.push(`${s}秒`);
                  return parts.join(' ');
                }
                return String(v);
              };
              return (
                <div>
                  <div className={styles.chartHeader}>
                    <div className={styles.chartControls}>
                      <label className={styles.chartControlLabel}>分组</label>
                      <div className={styles.chartTypeTabs}>
                        {CHART_GROUPS.map((g) => (
                          <button key={g.id} className={`${styles.viewTab} ${chartGroup === g.id ? styles.viewActive : ''}`} onClick={() => setChartGroup(g.id)}>{g.title}</button>
                        ))}
                      </div>
                      <label className={styles.chartControlLabel}>类型</label>
                      <div className={styles.chartTypeTabs}>
                        <button className={`${styles.viewTab} ${chartType === 'bar' ? styles.viewActive : ''}`} onClick={() => setChartType('bar')}>柱状图</button>
                        <button className={`${styles.viewTab} ${chartType === 'line' ? styles.viewActive : ''}`} onClick={() => setChartType('line')}>折线图</button>
                      </div>
                    </div>
                    <div className={styles.legend}>
                      {currentGroup.keys.map((k, idx) => (
                        <div key={String(k)} className={styles.legendItem}>
                          <span className={styles.legendSwatch} style={{ backgroundColor: ['#2563eb', '#f97316', '#10b981', '#ef4444', '#7c3aed', '#0ea5e9'][idx % 6] }} />
                          <span className={styles.legendLabel}>{metricLabels[k as MetricKey]}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className={styles.chartWrapper}>
                    <svg className={styles.chartCanvas} viewBox={`0 0 ${width} ${height}`}>
                      <rect x={padding.left} y={padding.top} width={innerWidth} height={innerHeight} rx={12} fill="rgba(241, 245, 249, 0.85)" />
                      {chartType === 'bar' ? (
                        (() => {
                          const seriesColors = ['#2563eb', '#f97316', '#10b981', '#ef4444', '#7c3aed', '#0ea5e9'];
                          const clusterGap = 18;
                          const seriesGap = 6;
                          const barWidth = Math.max(10, Math.floor((innerWidth / items.length - clusterGap) / currentGroup.keys.length) - seriesGap);
                          const xForIndex = (i: number) => padding.left + i * (innerWidth / items.length) + 8;
                          const scaleYForKey = (k: MetricKey) => {
                            const min = Math.min(0, groupStats.minByKey[k]);
                            const max = groupStats.maxByKey[k];
                            return (v: number) => {
                              const safeV = typeof v === 'number' ? v : 0;
                              if (max === min) return padding.top + innerHeight / 2;
                              const t = (safeV - min) / (max - min);
                              return padding.top + innerHeight - t * innerHeight;
                            };
                          };
                          return (
                            <g>
                              <line x1={padding.left} x2={padding.left + innerWidth} y1={padding.top + innerHeight} y2={padding.top + innerHeight} className={styles.axis} />
                              {currentGroup.keys.map((k, si) => {
                                const color = seriesColors[si % seriesColors.length];
                                const scaleY = scaleYForKey(k as MetricKey);
                                return (
                                  <g key={`bars-${String(k)}`}>
                                    {items.map((m, idx) => {
                                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                      const val = typeof (m as any)[k] === 'number' ? ((m as any)[k] as number) : 0;
                                      const x = xForIndex(idx) + si * (barWidth + seriesGap);
                                      const y = scaleY(val);
                                      const zeroY = scaleY(0);
                                      const h = Math.abs(y - zeroY);
                                      const finalY = val >= 0 ? y : zeroY;
                                      return (
                                        <rect key={`${m.id}-${k}`} x={x} y={finalY} width={barWidth} height={h || 1} fill={color} opacity={0.9} rx={2} />
                                      );
                                    })}
                                  </g>
                                );
                              })}
                            </g>
                          );
                        })()
                      ) : (
                        (() => {
                          const seriesColors = ['#2563eb', '#f97316', '#10b981', '#ef4444', '#7c3aed', '#0ea5e9'];
                          const xForIndex = (i: number) => padding.left + i * (innerWidth / (items.length - 1 || 1));
                          const scaleYForKey = (k: MetricKey) => {
                            const min = Math.min(0, groupStats.minByKey[k]);
                            const max = groupStats.maxByKey[k];
                            return (v: number) => {
                              const safeV = typeof v === 'number' ? v : 0;
                              if (max === min) return padding.top + innerHeight / 2;
                              const t = (safeV - min) / (max - min);
                              return padding.top + innerHeight - t * innerHeight;
                            };
                          };
                          return (
                            <g>
                              <line x1={padding.left} x2={padding.left + innerWidth} y1={padding.top + innerHeight} y2={padding.top + innerHeight} className={styles.axis} />
                              {currentGroup.keys.map((k, si) => {
                                const color = seriesColors[si % seriesColors.length];
                                const scaleY = scaleYForKey(k as MetricKey);
                                const points = items.map((m, idx) => {
                                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                  const val = typeof (m as any)[k] === 'number' ? ((m as any)[k] as number) : 0;
                                  return `${xForIndex(idx)},${scaleY(val)}`;
                                }).join(' ');
                                return (
                                  <polyline key={`line-${String(k)}`} points={points} fill="none" stroke={color} strokeWidth={2} opacity={0.9} />
                                );
                              })}
                            </g>
                          );
                        })()
                      )}
                      {/* Axis Labels */}
                      <g className={styles.axisLabels}>
                        {ticks.map((t, i) => {
                          const min = Math.min(0, minForChart);
                          const max = Math.max(0, maxForChart);
                          const y = padding.top + innerHeight - ((t - min) / (max - min || 1)) * innerHeight;
                          return (
                            <text key={`tick-${i}`} x={padding.left - 8} y={y} textAnchor="end" alignmentBaseline="middle" fontSize={10} fill="#64748b">
                              {formatValue(t)}
                            </text>
                          );
                        })}
                      </g>
                      <g className={styles.axisLabels}>
                        {items.map((m, i) => {
                          const x = padding.left + i * (innerWidth / (items.length || 1)) + (innerWidth / (items.length || 1)) / 2;
                          return (
                            <text key={`lbl-${m.id}`} x={x} y={padding.top + innerHeight + 16} textAnchor="middle" fontSize={10} fill="#64748b">
                              {m.name.substring(0, 6)}
                            </text>
                          );
                        })}
                      </g>
                    </svg>
                  </div>
                </div>
              );
            })()
          )}
        </div>
      </div>
    </Modal>
  );
}
