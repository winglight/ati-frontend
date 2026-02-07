import PanelCard, { PanelAction } from './PanelCard';
import styles from './DepthPanel.module.css';
import type { DepthSnapshot } from '../types';
import { DEFAULT_MARKET_TIMEZONE, formatWithTimezone } from '../../../utils/timezone.js';

interface DepthPanelProps {
  depth: DepthSnapshot;
}

const formatNumber = (value: number | null | undefined): string => {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return '—';
  }
  return value.toFixed(2);
};

const DISPLAY_LOCALE = 'zh-CN';

const formatTimestamp = (value: string | undefined): string => {
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

function DepthPanel({ depth }: DepthPanelProps) {
  const actions: PanelAction[] = [{ label: '订阅 DOM' }];

  return (
    <PanelCard title="盘口深度" actions={actions}>
      <div className={styles.container}>
        <div className={styles.summaryRow}>
          <div className={styles.summaryItem}>
            <span className={styles.summaryLabel}>中间价</span>
            <span className={styles.summaryValue}>{formatNumber(depth.midPrice ?? null)}</span>
          </div>
          <div className={styles.summaryItem}>
            <span className={styles.summaryLabel}>价差</span>
            <span className={styles.summaryValue}>{formatNumber(depth.spread ?? null)}</span>
          </div>
          <div className={styles.summaryItem}>
            <span className={styles.summaryLabel}>更新时间</span>
            <span className={styles.summaryValue}>{formatTimestamp(depth.updatedAt)}</span>
          </div>
        </div>
        <div className={styles.tablesRow}>
          <div className={styles.tableWrapper}>
            <div className={styles.title}>买盘</div>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>价格</th>
                  <th>数量</th>
                </tr>
              </thead>
              <tbody>
                {depth.bids.map((bid, index) => (
                  <tr key={`bid-${index}`}>
                    <td className={styles.bid}>{bid.price.toFixed(2)}</td>
                    <td>{bid.size.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className={styles.tableWrapper}>
            <div className={styles.title}>卖盘</div>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>价格</th>
                  <th>数量</th>
                </tr>
              </thead>
              <tbody>
                {depth.asks.map((ask, index) => (
                  <tr key={`ask-${index}`}>
                    <td className={styles.ask}>{ask.price.toFixed(2)}</td>
                    <td>{ask.size.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </PanelCard>
  );
}

export default DepthPanel;
