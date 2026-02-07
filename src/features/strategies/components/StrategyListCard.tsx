import type { KeyboardEvent as ReactKeyboardEvent, MouseEvent } from 'react';
import PanelCard from '@features/dashboard/components/PanelCard';
import type {
  StrategyItem,
  StrategyMetricsSnapshot,
  StrategyPerformanceSnapshot
} from '@features/dashboard/types';
import {
  formatDailyPnl,
  formatDailyTrades,
  getStrategyDailyStats
} from '@features/strategies/utils/dailyStats';
import type { RequestStatus } from '@store/slices/strategiesSlice';
import styles from './StrategyListCard.module.css';
import { DOM_KEYWORDS, KLINE_KEYWORDS, SCREENER_KEYWORDS, includesKeyword } from './strategyKeywords';

interface StrategyListCardProps {
  strategies: StrategyItem[];
  selectedId: string | null;
  operations: Record<string, RequestStatus>;
  operationErrors?: Record<string, string | undefined>;
  metricsById?: Record<string, StrategyMetricsSnapshot | null>;
  performanceById?: Record<string, StrategyPerformanceSnapshot | null>;
  onSelect: (strategyId: string) => void;
  onStart: (strategyId: string) => void;
  onStop: (strategyId: string) => void;
  onEdit: (strategyId: string) => void;
}

const statusBadge = (status: StrategyItem['status']) => {
  switch (status) {
    case 'running':
      return { label: '运行中', className: `${styles.statusBadge} ${styles.statusRunning}` };
    case 'error':
      return { label: '异常', className: `${styles.statusBadge} ${styles.statusError}` };
    case 'starting':
      return { label: '启动中', className: `${styles.statusBadge} ${styles.statusStarting}` };
    case 'stopped':
    default:
      return { label: '已停止', className: `${styles.statusBadge} ${styles.statusStopped}` };
  }
};

const resolveSubscriptionType = (strategy: StrategyItem): 'D' | 'C' | 'S' | null => {
  if (typeof strategy.isKlineStrategy === 'boolean') {
    return strategy.isKlineStrategy ? 'C' : 'D';
  }
  const candidates: string[] = [];
  if (typeof strategy.templateId === 'string') {
    candidates.push(strategy.templateId);
  }
  if (typeof strategy.dataSource === 'string') {
    candidates.push(strategy.dataSource);
  }
  if (typeof strategy.filePath === 'string') {
    candidates.push(strategy.filePath);
  }
  if (Array.isArray(strategy.tags)) {
    candidates.push(
      ...strategy.tags.filter((tag): tag is string => typeof tag === 'string' && !!tag.trim())
    );
  }

  for (const raw of candidates) {
    const normalized = raw.trim().toLowerCase();
    if (!normalized) {
      continue;
    }
    if (includesKeyword(normalized, DOM_KEYWORDS)) {
      return 'D';
    }
    if (includesKeyword(normalized, KLINE_KEYWORDS)) {
      return 'C';
    }
    if (includesKeyword(normalized, SCREENER_KEYWORDS)) {
      return 'S';
    }
  }

  return null;
};

function StrategyListCard({
  strategies,
  selectedId,
  operations,
  operationErrors = {},
  metricsById = {},
  performanceById = {},
  onSelect,
  onStart,
  onStop,
  onEdit
}: StrategyListCardProps) {
  return (
    <PanelCard title="策略列表">
      <div className={styles.list}>
        {strategies.length === 0 ? (
          <div className={styles.empty}>暂无策略，等待创建或注册。</div>
        ) : (
          strategies.map((strategy) => {
            const badge = statusBadge(strategy.status);
            const operationStatus = operations[strategy.id] ?? 'idle';
            const isLoading = operationStatus === 'loading';
            const isFailed = operationStatus === 'failed';
            const isSelected = strategy.id === selectedId;
            const subscriptionType = resolveSubscriptionType(strategy);
            const operationErrorMessage = operationErrors[strategy.id];
            const isScreener = subscriptionType === 'S';
            const { dailyPnl, dailyTrades } = isScreener
              ? { dailyPnl: null, dailyTrades: null }
              : getStrategyDailyStats(strategy, {
                  metrics: metricsById[strategy.id] ?? null,
                  performance: performanceById[strategy.id] ?? null
                });
            const handleStartStop = (event: MouseEvent<HTMLButtonElement>) => {
              event.stopPropagation();
              if (isLoading) {
                return;
              }
              if (strategy.status === 'running') {
                onStop(strategy.id);
              } else {
                onStart(strategy.id);
              }
            };
            const handleEdit = (event: MouseEvent<HTMLButtonElement>) => {
              event.stopPropagation();
              if (isLoading) {
                return;
              }
              onEdit(strategy.id);
            };
            const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                onSelect(strategy.id);
              }
            };
            return (
              <div
                key={strategy.id}
                className={`${styles.card} ${isSelected ? styles.selected : ''}`}
                onClick={() => onSelect(strategy.id)}
                onKeyDown={handleKeyDown}
                role="button"
                tabIndex={0}
              >
                <div className={styles.cardContent}>
                  <div className={styles.cardHeader}>
                    <div className={styles.titleGroup}>
                      <div className={styles.nameRow}>
                        <span className={styles.name}>{strategy.name}</span>
                        {subscriptionType ? (
                          <span className={styles.typeBadge} aria-label="subscription-type">
                            {subscriptionType}
                          </span>
                        ) : null}
                      </div>
                      <span className={styles.symbol}>{strategy.symbol}</span>
                    </div>
                    <span className={badge.className}>{badge.label}</span>
                  </div>
                  <div className={styles.metrics}>
                    {isScreener ? (
                      <>
                        <div className={styles.metricItem}>
                          <span className={styles.metricLabel}>扫描代码</span>
                          <span className={styles.metricValue}>
                            {strategy.screenerProfile?.scan_code ?? '—'}
                          </span>
                        </div>
                        <div className={styles.metricItem}>
                          <span className={styles.metricLabel}>结果数量</span>
                          <span className={styles.metricValue}>
                            {strategy.screenerProfile?.number_of_rows ?? '—'}
                          </span>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className={styles.metricItem}>
                          <span className={styles.metricLabel}>日内 PnL</span>
                          <span
                            className={`${styles.metricValue} ${
                              dailyPnl === null
                                ? ''
                                : dailyPnl >= 0
                                ? styles.valuePositive
                                : styles.valueNegative
                            }`}
                          >
                            {formatDailyPnl(dailyPnl)}
                          </span>
                        </div>
                        <div className={styles.metricItem}>
                          <span className={styles.metricLabel}>日内交易次数</span>
                          <span className={styles.metricValue}>{formatDailyTrades(dailyTrades)}</span>
                        </div>
                      </>
                    )}
                  </div>
                </div>
                <div className={styles.actionsSection}>
                  <div className={styles.actionsRow}>
                    <button
                      type="button"
                      className={`${styles.actionButton} ${styles.secondaryButton}`}
                      onClick={handleEdit}
                      disabled={isLoading}
                    >
                      编辑
                    </button>
                    <button
                      type="button"
                      className={`${styles.actionButton} ${styles.primaryButton}`}
                      onClick={handleStartStop}
                      disabled={isLoading}
                    >
                      {isLoading ? '处理中...' : strategy.status === 'running' ? '停止' : '启动'}
                    </button>
                  </div>
                  {isFailed ? (
                    <div className={styles.operationError} role="status" aria-live="polite">
                      <span className={styles.operationErrorBadge}>启动失败</span>
                      <span className={styles.operationErrorMessage}>
                        {operationErrorMessage ?? '启动策略失败，请稍后重试'}
                      </span>
                    </div>
                  ) : null}
                </div>
              </div>
            );
          })
        )}
      </div>
    </PanelCard>
  );
}

export default StrategyListCard;
