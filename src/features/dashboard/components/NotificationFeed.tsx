import type { RequestStatus } from '@store/slices/notificationsSlice';
import PanelCard, { PanelAction } from './PanelCard';
import styles from './NotificationFeed.module.css';
import { NotificationItem } from '../types';

interface NotificationFeedProps {
  notifications: NotificationItem[];
  total: number;
  unreadCount: number;
  status: RequestStatus;
  error?: string;
  lastFetchedAt?: string;
  acknowledgingIds?: string[];
  deletingIds?: string[];
  onRefresh?: () => void;
  onMarkAllRead?: () => void;
  onMarkAsRead?: (id: string) => void;
  onDelete?: (id: string) => void;
}

function NotificationFeed({
  notifications,
  total,
  unreadCount,
  status,
  error,
  lastFetchedAt,
  acknowledgingIds,
  deletingIds,
  onRefresh,
  onMarkAllRead,
  onMarkAsRead,
  onDelete
}: NotificationFeedProps) {
  const isLoading = status === 'loading';
  const hasError = Boolean(error);
  const isEmpty = !notifications.length && !isLoading && !hasError;
  const formattedTimestamp = lastFetchedAt ? new Date(lastFetchedAt).toLocaleTimeString() : undefined;

  const headerActions: PanelAction[] = [];

  if (onRefresh) {
    headerActions.push({
      label: isLoading ? '刷新中…' : '刷新',
      onClick: () => {
        if (!isLoading) {
          onRefresh();
        }
      }
    });
  }

  if (onMarkAllRead) {
    headerActions.push({
      label: '全部标记已读',
      onClick: () => {
        if (!isLoading) {
          onMarkAllRead();
        }
      }
    });
  }

  return (
    <PanelCard title="通知中心" actions={headerActions.length ? headerActions : undefined}>
      <div className={styles.container}>
        <div className={styles.summaryRow}>
          <span>未读：{unreadCount}</span>
          <span>总计：{total}</span>
        </div>
        {hasError ? (
          <div className={styles.statusMessage}>
            <span>{error}</span>
            {onRefresh ? (
              <button type="button" onClick={onRefresh} disabled={isLoading}>
                重试
              </button>
            ) : null}
          </div>
        ) : null}
        {isLoading ? <div className={styles.statusMessage}>加载中…</div> : null}
        {isEmpty ? <div className={styles.placeholder}>暂无通知</div> : null}
        <div className={styles.list}>
          {notifications.map((notification) => {
            const acknowledging = acknowledgingIds?.includes(notification.id);
            const deleting = deletingIds?.includes(notification.id);

            return (
              <article
                key={notification.id}
                className={`${styles.item} ${styles[notification.severity]} ${
                  notification.read ? styles.read : styles.unread
                }`}
              >
                <div className={styles.itemHeader}>
                  <div className={styles.itemInfo}>
                    <span className={styles.title}>{notification.title}</span>
                    <span className={styles.timestamp}>
                      {new Date(notification.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                  <div className={styles.itemActions}>
                    {!notification.read && onMarkAsRead ? (
                      <button
                        type="button"
                        onClick={() => onMarkAsRead(notification.id)}
                        disabled={acknowledging || isLoading}
                      >
                        {acknowledging ? '处理中…' : '标记已读'}
                      </button>
                    ) : null}
                    {onDelete ? (
                      <button
                        type="button"
                        onClick={() => onDelete(notification.id)}
                        disabled={deleting || isLoading}
                      >
                        {deleting ? '删除中…' : '删除'}
                      </button>
                    ) : null}
                  </div>
                </div>
                <p className={styles.message}>{notification.message}</p>
              </article>
            );
          })}
        </div>
        {formattedTimestamp ? (
          <div className={styles.footer}>最后更新：{formattedTimestamp}</div>
        ) : null}
      </div>
    </PanelCard>
  );
}

export default NotificationFeed;
