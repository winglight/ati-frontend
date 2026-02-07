import type {
  MarketAvailability,
  MarketBar,
  MarketTickerSnapshot
} from '../types';
import { DEFAULT_MARKET_TIMEZONE, formatWithTimezone } from '../../../utils/timezone.js';
import PanelCard, { PanelAction } from './PanelCard';
import styles from './ChartArea.module.css';

interface ChartAreaProps {
  symbol: string;
  timeframe: string;
  bars: MarketBar[];
  ticker: MarketTickerSnapshot | null;
  availability: MarketAvailability | null;
}

export const formatNumber = (value: number | null | undefined, fractionDigits = 2): string => {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return '—';
  }
  return value.toFixed(fractionDigits);
};

export const formatPercent = (value: number | null | undefined): string => {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return '—';
  }
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}%`;
};

export const formatVolume = (value: number | null | undefined): string => {
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

const DISPLAY_LOCALE = 'zh-CN';

export const formatTime = (value: string | undefined | null): string => {
  if (!value) {
    return '—';
  }
  const formatted = formatWithTimezone(
    value,
    {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    },
    DISPLAY_LOCALE,
    DEFAULT_MARKET_TIMEZONE
  );
  return formatted ?? value;
};

export const formatTimeShort = (value: string | undefined | null): string => {
  if (!value) {
    return '—';
  }
  const formatted = formatWithTimezone(
    value,
    {
      hour: '2-digit',
      minute: '2-digit'
    },
    DISPLAY_LOCALE,
    DEFAULT_MARKET_TIMEZONE
  );
  return formatted ?? value;
};

function ChartArea({ symbol, timeframe, bars, ticker, availability }: ChartAreaProps) {
  const latestBar = bars.length > 0 ? bars[bars.length - 1] : undefined;
  const previousBar = bars.length > 1 ? bars[bars.length - 2] : undefined;
  const lastPrice = ticker?.last ?? latestBar?.close ?? null;
  const referencePrice = ticker?.close ?? previousBar?.close ?? latestBar?.open ?? null;
  const changeValue = ticker?.change ?? (lastPrice !== null && referencePrice !== null ? lastPrice - referencePrice : null);
  const changePercent = ticker?.changePercent ?? (changeValue !== null && referencePrice ? (changeValue / referencePrice) * 100 : null);
  const spread = ticker?.spread ??
    (ticker?.ask != null && ticker?.bid != null
      ? ticker.ask - ticker.bid
      : latestBar
        ? latestBar.high - latestBar.low
        : null);
  const highPrice = bars.reduce<number | null>((max, bar) => {
    if (!Number.isFinite(bar.high)) {
      return max;
    }
    if (max === null) {
      return bar.high;
    }
    return Math.max(max, bar.high);
  }, null);
  const lowPrice = bars.reduce<number | null>((min, bar) => {
    if (!Number.isFinite(bar.low)) {
      return min;
    }
    if (min === null) {
      return bar.low;
    }
    return Math.min(min, bar.low);
  }, null);
  const recentBars = bars.slice(-6).reverse();

  const availabilityText = (() => {
    if (!availability) {
      return 'NaN';
    }
    if (availability.status === 'missing') {
      if (availability.pendingBackfill) {
        const jobHint = availability.backfillJobId ? `（任务 ${availability.backfillJobId.slice(0, 8)}）` : '';
        return `本地暂无 ${symbol} ${timeframe} 数据，已自动提交回补${jobHint}`;
      }
      const suggestedRange = availability.suggestedStart && availability.suggestedEnd
        ? `${formatTime(availability.suggestedStart)} ~ ${formatTime(availability.suggestedEnd)}`
        : '默认回补窗口';
      return `本地暂无 ${symbol} ${timeframe} 数据，建议发起回补：${suggestedRange}`;
    }
    return `覆盖区间：${formatTime(availability.start)} ~ ${formatTime(availability.end)} · 文件 ${availability.fileCount} 个`;
  })();

  const actions: PanelAction[] = [
    { label: '加载更多历史' },
    { label: '指标设置' }
  ];

  return (
    <PanelCard title="行情图表" actions={actions}>
      <div className={styles.container}>
        <div className={styles.headerRow}>
          <span>标的：{symbol}</span>
          <span>周期：{timeframe}</span>
        </div>
        <div className={styles.metricsRow}>
          <div className={styles.metric}>
            <span className={styles.metricLabel}>最新价</span>
            <span className={styles.metricValue}>{formatNumber(lastPrice)}</span>
          </div>
          <div className={styles.metric}>
            <span className={styles.metricLabel}>涨跌幅</span>
            <span className={styles.metricValue}>{formatPercent(changePercent)}</span>
          </div>
          <div className={styles.metric}>
            <span className={styles.metricLabel}>买一 / 卖一</span>
            <span className={styles.metricValue}>
              {formatNumber(ticker?.bid)} / {formatNumber(ticker?.ask)}
            </span>
          </div>
          <div className={styles.metric}>
            <span className={styles.metricLabel}>价差 / 振幅</span>
            <span className={styles.metricValue}>
              {formatNumber(spread)} / {highPrice !== null && lowPrice !== null ? formatNumber(highPrice - lowPrice) : '—'}
            </span>
          </div>
          <div className={styles.metric}>
            <span className={styles.metricLabel}>最新量</span>
            <span className={styles.metricValue}>{formatVolume(latestBar?.volume ?? ticker?.lastSize ?? null)}</span>
          </div>
        </div>
        <div className={styles.chartPlaceholder}>
          <table className={styles.barTable}>
            <thead>
              <tr>
                <th>时间</th>
                <th>开盘</th>
                <th>最高</th>
                <th>最低</th>
                <th>收盘</th>
                <th>成交量</th>
              </tr>
            </thead>
            <tbody>
              {recentBars.map((bar) => (
                <tr key={bar.timestamp}>
                  <td>{formatTimeShort(bar.timestamp)}</td>
                  <td>{formatNumber(bar.open)}</td>
                  <td>{formatNumber(bar.high)}</td>
                  <td>{formatNumber(bar.low)}</td>
                  <td>{formatNumber(bar.close)}</td>
                  <td>{formatVolume(bar.volume ?? null)}</td>
                </tr>
              ))}
              {recentBars.length === 0 ? (
                <tr>
                  <td colSpan={6} className={styles.emptyPlaceholder}>
                    暂无 K 线数据，等待历史查询返回结果。
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <div className={styles.availability}>{availabilityText}</div>
      </div>
    </PanelCard>
  );
}

export default ChartArea;
