import clsx from 'clsx';
import styles from './PnLCalendarPage.module.css';
import type { TradeLogRecord } from '@services/tradeLogsApi';

interface LogSidebarProps {
  logs: TradeLogRecord[];
  loading?: boolean;
  activeLogId?: number | null;
  onOpen: (log: TradeLogRecord) => void;
  onEdit: (log: TradeLogRecord) => void;
  onDelete: (log: TradeLogRecord) => void;
}

const formatLogType = (type: TradeLogRecord['type']): string =>
  type === 'weekly' ? '周复盘' : '日复盘';

const formatLogSummary = (log: TradeLogRecord): string => {
  if (log.type === 'weekly') {
    const trades = log.weekly_total_trades ?? log.trades_count;
    const pnl = log.weekly_pnl_result;
    if (trades !== null && trades !== undefined) {
      return `交易 ${trades} 笔${pnl !== null && pnl !== undefined ? ` · 周盈亏 ${pnl.toFixed(2)}` : ''}`;
    }
    return '周度复盘记录';
  }
  if (log.trades_count !== null && log.trades_count !== undefined) {
    return `交易 ${log.trades_count} 笔${log.overall_feeling ? ` · 感受 ${log.overall_feeling}` : ''}`;
  }
  return log.overall_feeling ? `感受 ${log.overall_feeling}` : '日度复盘记录';
};

function LogSidebar({
  logs,
  loading = false,
  activeLogId,
  onOpen,
  onEdit,
  onDelete
}: LogSidebarProps) {
  return (
    <aside className={styles.logSidebar}>
      <div className={styles.logHeader}>
        <div>
          <h3 className={styles.logTitle}>交易日志</h3>
          <p className={styles.logSubtitle}>按时间倒序查看每日/每周复盘。</p>
        </div>
      </div>
      <div className={styles.logList}>
        {loading ? <div className={styles.logEmpty}>正在加载日志...</div> : null}
        {!loading && logs.length === 0 ? (
          <div className={styles.logEmpty}>当前范围暂无日志。</div>
        ) : null}
        {!loading && logs.length > 0 ? (
          <ul className={styles.logItems}>
            {logs.map((log) => (
              <li
                key={log.id ?? `${log.date}-${log.type}`}
                className={clsx(styles.logItem, {
                  [styles.logItemActive]: activeLogId === log.id
                })}
              >
                <div className={styles.logItemHeader}>
                  <div>
                    <div className={styles.logMeta}>{log.date}</div>
                    <div className={styles.logSummary}>{formatLogSummary(log)}</div>
                  </div>
                  <span className={styles.logTypeBadge}>{formatLogType(log.type)}</span>
                </div>
                <div className={styles.logActions}>
                  <button type="button" className={styles.logActionButton} onClick={() => onOpen(log)}>
                    打开
                  </button>
                  <button type="button" className={styles.logActionButton} onClick={() => onEdit(log)}>
                    编辑
                  </button>
                  <button type="button" className={styles.logActionButtonDanger} onClick={() => onDelete(log)}>
                    删除
                  </button>
                </div>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </aside>
  );
}

export default LogSidebar;
