import PanelCard from '@features/dashboard/components/PanelCard';
import type { RiskMetricsSummary, RiskFallbackMode } from '../types';
import styles from './RiskMetricsPanel.module.css';

interface RiskMetricsPanelProps {
  metrics: RiskMetricsSummary | null;
  fallbackMode: RiskFallbackMode;
}

const formatNumber = (value: number | undefined, digits = 0): string => {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return '0';
  }
  return value.toFixed(digits);
};

function RiskMetricsPanel({ metrics, fallbackMode }: RiskMetricsPanelProps) {
  const totalEvents = metrics?.totalEvents ?? 0;
  const blockedOrders = metrics?.actions?.block_order ?? 0;
  const reducePosition = metrics?.actions?.reduce_position ?? 0;
  const lastEventAt = metrics?.lastEventAt ?? null;

  return (
    <PanelCard title="风控指标">
      <div className={styles.metricsGrid}>
        <div className={styles.summaryRow}>
          <span>{fallbackMode === 'websocket' ? '实时订阅' : 'HTTP 轮询'}</span>
          {lastEventAt ? <span>最近事件：{new Date(lastEventAt).toLocaleString()}</span> : null}
        </div>
        <div className={styles.metricCard}>
          <div className={styles.metricLabel}>累计事件</div>
          <div className={styles.metricValue}>{formatNumber(totalEvents)}</div>
        </div>
        <div className={styles.metricCard}>
          <div className={styles.metricLabel}>拦截下单</div>
          <div className={styles.metricValue}>{formatNumber(blockedOrders)}</div>
        </div>
        <div className={styles.metricCard}>
          <div className={styles.metricLabel}>减仓执行</div>
          <div className={styles.metricValue}>{formatNumber(reducePosition)}</div>
        </div>
        <div className={styles.metricCard}>
          <div className={styles.metricLabel}>最后告警</div>
          <div className={styles.metricValue}>
            {lastEventAt ? new Date(lastEventAt).toLocaleString() : '—'}
          </div>
        </div>
      </div>
    </PanelCard>
  );
}

export default RiskMetricsPanel;
