import { ChangeEvent, useCallback, useEffect, useMemo, useState } from 'react';
import Modal from './Modal';
import NotificationSettingsModal from './NotificationSettingsModal';
import styles from './NotificationCenterModal.module.css';
import { useAppDispatch, useAppSelector } from '@store/hooks';
import {
  acknowledgeAllNotifications,
  acknowledgeNotificationById,
  deleteNotificationById,
  fetchNotifications
} from '@store/thunks/notifications';
import {
  resetNotificationFilters,
  setNotificationChannel,
  setNotificationSearch,
  setNotificationSeverity,
  setNotificationSince,
  setNotificationStatus,
  setNotificationUnreadOnly
} from '@store/slices/notificationsSlice';

interface NotificationCenterModalProps {
  open: boolean;
  onClose: () => void;
}

const formatTime = (timestamp: string | null | undefined): string => {
  if (!timestamp) {
    return '—';
  }
  const parsed = new Date(timestamp);
  if (Number.isNaN(parsed.getTime())) {
    return timestamp;
  }
  return `${parsed.toLocaleDateString()} ${parsed.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`;
};

const toInputValue = (value: string | null | undefined): string => {
  if (!value) {
    return '';
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return '';
  }
  const pad = (num: number) => String(num).padStart(2, '0');
  return `${parsed.getFullYear()}-${pad(parsed.getMonth() + 1)}-${pad(parsed.getDate())}T${pad(parsed.getHours())}:${pad(
    parsed.getMinutes()
  )}`;
};

const fromInputValue = (value: string): string | null => {
  if (!value) {
    return null;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed.toISOString();
};

const severityLabels: Record<'all' | 'info' | 'warning' | 'error', string> = {
  all: '全部',
  info: '信息',
  warning: '警告',
  error: '错误'
};

function NotificationCenterModal({ open, onClose }: NotificationCenterModalProps) {
  const dispatch = useAppDispatch();
  const notificationsState = useAppSelector((state) => state.notifications);
  const {
    items,
    unreadCount,
    status,
    total,
    acknowledgingIds,
    deletingIds,
    lastFetchedAt,
    filters
  } = notificationsState;

  const [statusFilter, setStatusFilter] = useState(filters.status);
  const [channelFilter, setChannelFilter] = useState(filters.channel);
  const [sinceInput, setSinceInput] = useState(toInputValue(filters.since));
  const [searchInput, setSearchInput] = useState(filters.search);
  const [unreadOnly, setUnreadOnly] = useState(filters.unreadOnly);
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    if (!open) {
      return;
    }
    if (status === 'idle') {
      void dispatch(fetchNotifications({ limit: 50 }));
      return;
    }
    const timer = window.setInterval(() => {
      void dispatch(fetchNotifications({ limit: 50 }));
    }, 20_000);
    return () => {
      window.clearInterval(timer);
    };
  }, [dispatch, open, status]);

  useEffect(() => {
    if (!open) {
      return;
    }
    setStatusFilter(filters.status);
    setChannelFilter(filters.channel);
    setSinceInput(toInputValue(filters.since));
    setSearchInput(filters.search);
    setUnreadOnly(filters.unreadOnly);
  }, [filters.channel, filters.search, filters.since, filters.status, filters.unreadOnly, open]);

  const availableChannels = useMemo(() => {
    const unique = new Set<string>();
    items.forEach((item) => {
      if (item.channel) {
        unique.add(item.channel);
      }
    });
    return Array.from(unique.values()).sort((a, b) => a.localeCompare(b));
  }, [items]);

  const availableStatuses = useMemo(() => {
    const base = new Set(['', 'sent', 'pending', 'failed']);
    items.forEach((item) => {
      if (item.status) {
        base.add(item.status.toLowerCase());
      }
    });
    return Array.from(base.values()).sort((a, b) => a.localeCompare(b));
  }, [items]);

  const matchesFilters = useCallback(
    (skipSeverity = false) => (item: typeof items[number]) => {
      if (!skipSeverity && filters.severity !== 'all' && item.severity !== filters.severity) {
        return false;
      }
      if (filters.unreadOnly && item.read) {
        return false;
      }
      if (filters.status) {
        if (!item.status || item.status.toLowerCase() !== filters.status.toLowerCase()) {
          return false;
        }
      }
      if (filters.channel) {
        if (!item.channel || item.channel.toLowerCase() !== filters.channel.toLowerCase()) {
          return false;
        }
      }
      if (filters.since) {
        const sinceDate = new Date(filters.since);
        const itemDate = new Date(item.timestamp);
        if (Number.isFinite(sinceDate.getTime()) && Number.isFinite(itemDate.getTime())) {
          if (itemDate < sinceDate) {
            return false;
          }
        }
      }
      if (filters.search) {
        const keyword = filters.search.toLowerCase();
        const text = [
          item.title,
          item.message,
          item.channel ?? '',
          item.status ?? '',
          item.event ?? '',
          item.errorDetail ?? ''
        ]
          .join('\n')
          .toLowerCase();
        if (!text.includes(keyword)) {
          return false;
        }
      }
      return true;
    },
    [filters]
  );

  const filteredWithoutSeverity = useMemo(
    () => items.filter(matchesFilters(true)),
    [items, matchesFilters]
  );

  const severityBreakdown = useMemo(() => {
    return filteredWithoutSeverity.reduce(
      (acc, item) => {
        acc[item.severity] += 1;
        return acc;
      },
      { info: 0, warning: 0, error: 0 }
    );
  }, [filteredWithoutSeverity]);

  const filteredItems = useMemo(
    () => filteredWithoutSeverity.filter(matchesFilters(false)),
    [filteredWithoutSeverity, matchesFilters]
  );

  const filteredUnreadCount = useMemo(
    () => filteredItems.filter((item) => !item.read).length,
    [filteredItems]
  );

  const handleRefresh = () => {
    void dispatch(
      fetchNotifications({ limit: 50, unreadOnly: filters.unreadOnly ? true : undefined })
    );
  };

  const handleMarkAllRead = () => {
    void dispatch(acknowledgeAllNotifications());
  };

  const handleMarkRead = (id: string) => {
    void dispatch(acknowledgeNotificationById(id));
  };

  const handleDelete = (id: string) => {
    void dispatch(deleteNotificationById(id));
  };

  const loading = status === 'loading';

  const applyFilters = () => {
    const sinceIso = fromInputValue(sinceInput);
    dispatch(setNotificationStatus(statusFilter));
    dispatch(setNotificationChannel(channelFilter));
    dispatch(setNotificationUnreadOnly(unreadOnly));
    dispatch(setNotificationSince(sinceIso));
    dispatch(setNotificationSearch(searchInput.trim()));
    void dispatch(
      fetchNotifications({ limit: 50, unreadOnly: unreadOnly ? true : undefined })
    );
  };

  const handleSinceChange = (event: ChangeEvent<HTMLInputElement>) => {
    setSinceInput(event.target.value);
  };

  const handleReset = () => {
    dispatch(resetNotificationFilters());
    setStatusFilter('');
    setChannelFilter('');
    setSinceInput('');
    setSearchInput('');
    setUnreadOnly(false);
    void dispatch(fetchNotifications({ limit: 50 }));
  };

  const handleSeveritySelect = (value: 'all' | 'info' | 'warning' | 'error') => {
    dispatch(setNotificationSeverity(value));
  };

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        title="通知中心"
        size="lg"
        headerActions={
          <div className={styles.headerButtons}>
            <button type="button" className={styles.settingsButton} onClick={() => setSettingsOpen(true)}>
              通知设置
            </button>
            <button
              type="button"
              className={styles.secondaryButton}
              onClick={handleMarkAllRead}
              disabled={!unreadCount}
            >
              全部已读
            </button>
            <button
              type="button"
              className={styles.secondaryButton}
              onClick={handleRefresh}
              disabled={loading}
            >
              {loading ? '刷新中…' : '刷新'}
            </button>
          </div>
        }
      >
        <div className={styles.layout}>
          <div className={styles.summaryRow}>
            <div className={styles.summaryItem}>
              <span className={styles.summaryLabel}>全部</span>
              <span className={styles.summaryValue}>{total}</span>
            </div>
            <div className={styles.summaryItem}>
              <span className={styles.summaryLabel}>未读</span>
              <span className={styles.summaryValue}>{unreadCount}</span>
            </div>
            <div className={styles.summaryItem}>
              <span className={styles.summaryLabel}>筛选结果</span>
              <span className={styles.summaryValue}>{filteredItems.length}</span>
            </div>
            <div className={styles.summaryItem}>
              <span className={styles.summaryLabel}>筛选未读</span>
              <span className={styles.summaryValue}>{filteredUnreadCount}</span>
            </div>
            <div className={styles.summaryItem}>
              <span className={styles.summaryLabel}>最近刷新</span>
              <span className={styles.summaryValue}>{lastFetchedAt ? formatTime(lastFetchedAt) : '—'}</span>
            </div>
          </div>
          <div className={styles.filterBar}>
            <div className={styles.filterGroup}>
              <label htmlFor="filterSeverity">级别</label>
              <div className={styles.severityTabs}>
                {(Object.keys(severityLabels) as Array<'all' | 'info' | 'warning' | 'error'>).map((key) => {
                  const count =
                    key === 'all'
                      ? filteredWithoutSeverity.length
                      : severityBreakdown[key as 'info' | 'warning' | 'error'];
                  const active = filters.severity === key;
                  return (
                    <button
                      type="button"
                      key={key}
                      className={`${styles.severityTab} ${active ? styles.severityTabActive : ''}`.trim()}
                      onClick={() => handleSeveritySelect(key)}
                    >
                      <span>{severityLabels[key]}</span>
                      <span className={styles.severityCount}>{count}</span>
                    </button>
                  );
                })}
              </div>
            </div>
            <div className={styles.filterControls}>
              <div className={styles.filterField}>
                <label htmlFor="notificationStatus">状态</label>
                <select
                  id="notificationStatus"
                  value={statusFilter}
                  onChange={(event) => setStatusFilter(event.target.value)}
                >
                  {availableStatuses.map((value) => (
                    <option key={value || 'all'} value={value}>
                      {value ? value.toUpperCase() : '全部'}
                    </option>
                  ))}
                </select>
              </div>
              <div className={styles.filterField}>
                <label htmlFor="notificationChannel">渠道</label>
                <select
                  id="notificationChannel"
                  value={channelFilter}
                  onChange={(event) => setChannelFilter(event.target.value)}
                >
                  <option value="">全部</option>
                  {availableChannels.map((channel) => (
                    <option key={channel} value={channel}>
                      {channel}
                    </option>
                  ))}
                </select>
              </div>
              <div className={styles.filterField}>
                <label htmlFor="notificationSince">起始时间</label>
                <input
                  id="notificationSince"
                  type="datetime-local"
                  value={sinceInput}
                  onChange={handleSinceChange}
                />
              </div>
              <div className={styles.filterField}>
                <label htmlFor="notificationSearch">关键字</label>
                <input
                  id="notificationSearch"
                  type="search"
                  placeholder="标题 / 内容 / 渠道"
                  value={searchInput}
                  onChange={(event) => setSearchInput(event.target.value)}
                />
              </div>
              <div className={styles.filterToggle}>
                <label htmlFor="notificationUnreadOnly">仅未读</label>
                <label className={styles.switch}>
                  <input
                    id="notificationUnreadOnly"
                    type="checkbox"
                    checked={unreadOnly}
                    onChange={(event) => setUnreadOnly(event.target.checked)}
                  />
                  <span className={styles.slider} />
                </label>
              </div>
            </div>
            <div className={styles.filterActions}>
              <button type="button" className={styles.primaryButton} onClick={applyFilters}>
                应用筛选
              </button>
              <button type="button" className={styles.ghostButton} onClick={handleReset}>
                重置
              </button>
            </div>
          </div>
          <div className={styles.tableWrapper}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>时间</th>
                  <th>渠道</th>
                  <th>事件</th>
                  <th>消息内容</th>
                  <th>状态</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.map((item) => {
                  const acknowledging = acknowledgingIds.includes(item.id);
                  const deleting = deletingIds.includes(item.id);
                  return (
                    <tr key={item.id} className={item.read ? '' : styles.rowUnread}>
                      <td>{formatTime(item.timestamp)}</td>
                      <td>
                        <div className={styles.channelCell}>
                          <span className={`${styles.severityBadge} ${styles[`severity-${item.severity}`]}`.trim()}>
                            {item.severity.toUpperCase()}
                          </span>
                          {item.channel || '—'}
                        </div>
                      </td>
                      <td>{item.event || item.title || '—'}</td>
                      <td>
                        <div className={styles.messageCell}>
                          <div className={styles.messageTitle}>{item.title || '系统通知'}</div>
                          <div className={styles.messageBody}>{item.message || '—'}</div>
                          {item.errorDetail ? (
                            <div className={styles.errorText}>错误：{item.errorDetail}</div>
                          ) : null}
                        </div>
                      </td>
                      <td>
                        <div className={styles.statusCell}>
                          <span>{item.status ? item.status.toUpperCase() : '—'}</span>
                          {item.acknowledgedAt ? (
                            <span className={styles.statusNote}>
                              已确认：{formatTime(item.acknowledgedAt)}
                            </span>
                          ) : null}
                        </div>
                      </td>
                      <td>
                        <div className={styles.rowActions}>
                          <button
                            type="button"
                            className={styles.linkButton}
                            onClick={() => handleMarkRead(item.id)}
                            disabled={item.read || acknowledging}
                          >
                            {acknowledging ? '操作中…' : item.read ? '已读' : '标记已读'}
                          </button>
                          <button
                            type="button"
                            className={styles.linkButtonDanger}
                            onClick={() => handleDelete(item.id)}
                            disabled={deleting}
                          >
                            {deleting ? '删除中…' : '删除'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {!filteredItems.length ? (
                  <tr>
                    <td colSpan={6} className={styles.emptyState}>
                      {loading
                        ? '正在同步最新通知数据...'
                        : items.length
                          ? '没有符合筛选条件的通知。'
                          : '暂无通知，系统运行正常。'}
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      </Modal>
      <NotificationSettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </>
  );
}

export default NotificationCenterModal;
