import clsx from 'clsx';
import styles from './PnLCalendarPage.module.css';
import type { TradeLogRecord } from '@services/tradeLogsApi';
import { useTranslation } from '@i18n';

interface LogSidebarProps {
  logs: TradeLogRecord[];
  loading?: boolean;
  activeLogId?: number | null;
  onOpen: (log: TradeLogRecord) => void;
  onEdit: (log: TradeLogRecord) => void;
  onDelete: (log: TradeLogRecord) => void;
}

function LogSidebar({
  logs,
  loading = false,
  activeLogId,
  onOpen,
  onEdit,
  onDelete
}: LogSidebarProps) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language === 'en' ? 'en-US' : 'zh-CN';

  const formatLogType = (type: TradeLogRecord['type']): string =>
    type === 'weekly' ? t('pnl_calendar.logs.type_weekly') : t('pnl_calendar.logs.type_daily');

  const formatLogSummary = (log: TradeLogRecord): string => {
    if (log.type === 'weekly') {
      const trades = log.weekly_total_trades ?? log.trades_count;
      const pnl = log.weekly_pnl_result;
      if (trades !== null && trades !== undefined) {
        return pnl !== null && pnl !== undefined
          ? t('pnl_calendar.logs.weekly_summary', {
              trades,
              pnl: new Intl.NumberFormat(locale, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2
              }).format(pnl)
            })
          : t('pnl_calendar.logs.weekly_trades', { trades });
      }
      return t('pnl_calendar.logs.weekly_default');
    }
    if (log.trades_count !== null && log.trades_count !== undefined) {
      return log.overall_feeling
        ? t('pnl_calendar.logs.daily_summary', { trades: log.trades_count, feeling: log.overall_feeling })
        : t('pnl_calendar.logs.daily_trades', { trades: log.trades_count });
    }
    return log.overall_feeling
      ? t('pnl_calendar.logs.daily_feeling_only', { feeling: log.overall_feeling })
      : t('pnl_calendar.logs.daily_default');
  };

  return (
    <aside className={styles.logSidebar}>
      <div className={styles.logHeader}>
        <div>
          <h3 className={styles.logTitle}>{t('pnl_calendar.logs.title')}</h3>
          <p className={styles.logSubtitle}>{t('pnl_calendar.logs.subtitle')}</p>
        </div>
      </div>
      <div className={styles.logList}>
        {loading ? <div className={styles.logEmpty}>{t('pnl_calendar.logs.loading')}</div> : null}
        {!loading && logs.length === 0 ? (
          <div className={styles.logEmpty}>{t('pnl_calendar.logs.empty')}</div>
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
                    {t('pnl_calendar.logs.open')}
                  </button>
                  <button type="button" className={styles.logActionButton} onClick={() => onEdit(log)}>
                    {t('pnl_calendar.logs.edit')}
                  </button>
                  <button type="button" className={styles.logActionButtonDanger} onClick={() => onDelete(log)}>
                    {t('pnl_calendar.logs.delete')}
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
