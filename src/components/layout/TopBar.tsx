import clsx from 'clsx';
import ServiceStatusPanel from '@features/dashboard/components/ServiceStatusPanel';
import { useAppSelector } from '@store/hooks';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useThrottledValue } from '../../hooks/useThrottledValue';
import styles from './TopBar.module.css';
import { useTranslation } from 'react-i18next';
import { setLanguage } from '../../i18n';

interface TopBarProps {
  onOpenData: () => void;
  onOpenNotifications: () => void;
  onOpenLogs: () => void;
  onOpenConfiguration: () => void;
}

function TopBar({ onOpenData, onOpenNotifications, onOpenLogs, onOpenConfiguration }: TopBarProps) {
  const { status, lastHeartbeat } = useAppSelector((state) => state.realtime);
  const unreadCount = useAppSelector((state) => state.notifications.unreadCount);
  const { user } = useAppSelector((state) => state.auth);
  const { items: subscriptions, error: subscriptionsError } = useAppSelector(
    (state) => state.strategies.marketDataSubscriptions
  );
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();

  const [version, setVersion] = useState<string>('');

  useEffect(() => {
    fetch('/version.json')
      .then((res) => res.json())
      .then((data) => {
        if (data?.version) {
          setVersion(data.version);
        }
      })
      .catch(() => {
        // Ignore error
      });
  }, []);

  // 节流订阅数据以减少顶部按钮文本频繁刷新造成的闪烁
  const throttledSubscriptions = useThrottledValue(subscriptions, 1000);

  const domCount = useMemo(
    () => throttledSubscriptions.filter((subscription) => subscription.enableDom).length,
    [throttledSubscriptions]
  );
  const klineCount = useMemo(
    () => throttledSubscriptions.filter((subscription) => subscription.enableBars).length,
    [throttledSubscriptions]
  );
  const tickCount = useMemo(
    () => throttledSubscriptions.filter((subscription) => subscription.enableTicker).length,
    [throttledSubscriptions]
  );

  const roleLabel = user?.roles?.length ? user.roles.join(', ') : '';
  const isConnected = status === 'connected';
  const statusText =
    status === 'connected'
      ? t('topbar.status.connected')
      : status === 'connecting'
        ? t('topbar.status.connecting')
        : t('topbar.status.offline');
  const heartbeatLabel = lastHeartbeat
    ? new Date(lastHeartbeat).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : status === 'connecting'
      ? t('topbar.heartbeat.handshake')
      : t('topbar.heartbeat.waiting');

  const toggleLanguage = () => {
    const next = i18n.language === 'zh' ? 'en' : 'zh';
    setLanguage(next as 'zh' | 'en');
  };

  return (
    <header className={styles.topBar}>
      <div className={styles.leftGroup}>
        <div className={styles.branding}>
          <div className={styles.logo}>
            <img src="/favicon.svg" alt="Algo Trader" style={{ width: '100%', height: '100%' }} />
          </div>
          <div className={styles.brandText}>
            <div className={styles.title}>{t('topbar.brand.title')}</div>
          </div>
        </div>
      </div>
      <div className={styles.centerGroup}>
        <div className={styles.statusPill}>
          <span className={clsx(styles.statusDot, { [styles.statusDotDanger]: !isConnected })} />
          {statusText}
        </div>
        <div className={styles.statusPill}>
          <span className={clsx(styles.statusDot, { [styles.statusDotDanger]: !isConnected })} />
          {t('topbar.heartbeat.prefix')}{heartbeatLabel}
        </div>
      </div>
      <div className={styles.rightGroup}>
        <ServiceStatusPanel />
        <button
          type="button"
          className={styles.iconButton}
          onClick={onOpenData}
          title={subscriptionsError ?? undefined}
        >
          {`D: ${domCount} K: ${klineCount} T: ${tickCount}`}
        </button>
        <button type="button" className={styles.iconButton} onClick={() => navigate('/pnl-calendar')}>
          PnL
        </button>
        <button type="button" className={styles.iconButton} onClick={onOpenConfiguration}>
          {t('topbar.buttons.config')}
        </button>
        <button type="button" className={styles.iconButton} onClick={onOpenNotifications}>
          {t('topbar.buttons.notifications')}
          {unreadCount > 0 ? <span className={styles.badge}>{unreadCount}</span> : null}
        </button>
        <button type="button" className={styles.iconButton} onClick={onOpenLogs}>
          {t('topbar.buttons.logs')}
        </button>
        <button
          type="button"
          className={styles.iconButton}
          onClick={toggleLanguage}
          title={i18n.language === 'zh' ? t('topbar.lang.switch_to_en') : t('topbar.lang.switch_to_zh')}
        >
          {i18n.language === 'zh' ? 'EN' : '中文'}
        </button>
        <div className={styles.userBadge}>
          <div className={styles.userInfo}>
            <span className={styles.userName}>{user?.username ?? t('topbar.user.guest')}</span>
            <span className={styles.userRole}>{roleLabel || (version ? `v${version}` : t('topbar.user.role_guest'))}</span>
          </div>
        </div>
      </div>
    </header>
  );
}

export default TopBar;
