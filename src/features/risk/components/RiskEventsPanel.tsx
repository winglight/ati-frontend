import PanelCard from '@features/dashboard/components/PanelCard';
import type { RiskEventItem } from '../types';
import styles from './RiskEventsPanel.module.css';
import { formatWithTimezone, normalizeTimestampToUtc } from '@utils/timezone';

interface RiskEventsPanelProps {
  events: RiskEventItem[];
}

const levelClass = (level: string): string => {
  switch (level) {
    case 'critical':
    case 'error':
      return styles.levelCritical;
    case 'warning':
      return styles.levelWarning;
    default:
      return styles.levelInfo;
  }
};

function RiskEventsPanel({ events }: RiskEventsPanelProps) {
  return (
    <PanelCard title="风险告警">
      <div className={styles.list}>
        <div className={styles.summary}>最近 30 条事件记录</div>
        {events.length === 0 ? (
          <div className={styles.empty}>暂无风险事件</div>
        ) : (
          events.map((event) => (
            <div key={event.id} className={styles.eventItem}>
              <div className={styles.eventHeader}>
                <span className={`${styles.level} ${levelClass(event.level)}`}>
                  {event.level.toUpperCase()}
                </span>
                <span className={styles.symbol}>{event.symbol}</span>
                <span className={styles.timestamp}>
                  {formatWithTimezone(
                    normalizeTimestampToUtc(event.createdAt) ?? event.createdAt,
                    { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false },
                    'zh-CN',
                    'Asia/Shanghai'
                  )}
                </span>
              </div>
              <div className={styles.message}>{event.message}</div>
              {event.actions.length ? (
                <div className={styles.actionsRow}>
                  {event.actions.map((action) => (
                    <span key={`${event.id}:${action.action}`} className={styles.actionTag}>
                      {action.action.replace(/_/g, ' ')}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
          ))
        )}
      </div>
    </PanelCard>
  );
}

export default RiskEventsPanel;
