import { ReactNode, useEffect, useState } from 'react';
import NotificationCenterModal from '../modals/NotificationCenterModal';
import LogsModal from '../modals/LogsModal';
import ConfigurationModal from '../modals/ConfigurationModal';
import MarketDataModal from '../modals/MarketDataModal';
import ToastCenter from '../ToastCenter';
import NotificationWatcher from '../NotificationWatcher';
import { useAppDispatch, useAppSelector } from '@store/hooks';
import { loadSystemInfo } from '@store/thunks/system';
import { isAnonymousAccessAllowed } from '@store/publicSession';
import TopBar from './TopBar';
import styles from './AppShell.module.css';

interface AppShellProps {
  children: ReactNode;
}

function AppShell({ children }: AppShellProps) {
  const dispatch = useAppDispatch();
  const infoStatus = useAppSelector((state) => state.system.infoStatus);
  const authStatus = useAppSelector((state) => state.auth.status);
  const authToken = useAppSelector((state) => state.auth.token);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [logsOpen, setLogsOpen] = useState(false);
  const [configurationOpen, setConfigurationOpen] = useState(false);
  const [dataOpen, setDataOpen] = useState(false);
  const allowAnonymous = isAnonymousAccessAllowed();
  const isAuthenticated = allowAnonymous || (authStatus === 'authenticated' && Boolean(authToken));

  useEffect(() => {
    if (!isAuthenticated) {
      return;
    }
    if (infoStatus === 'idle') {
      void dispatch(loadSystemInfo());
    }
  }, [dispatch, infoStatus, isAuthenticated]);

  useEffect(() => {
    if (isAuthenticated) {
      return;
    }
    setNotificationsOpen(false);
    setLogsOpen(false);
    setConfigurationOpen(false);
    setDataOpen(false);
  }, [isAuthenticated]);

  if (!isAuthenticated) {
    return (
      <div className={styles.shell}>
        <main className={styles.main}>
          <div className={styles.mainInner}>{children}</div>
        </main>
        <ToastCenter position="top-right" />
      </div>
    );
  }

  return (
    <div className={styles.shell}>
      <TopBar
        onOpenData={() => setDataOpen(true)}
        onOpenNotifications={() => setNotificationsOpen(true)}
        onOpenLogs={() => setLogsOpen(true)}
        onOpenConfiguration={() => setConfigurationOpen(true)}
      />
      <main className={styles.main}>
        <div className={styles.mainInner}>{children}</div>
      </main>
      <div className={styles.modalLayer}>
        <NotificationCenterModal open={notificationsOpen} onClose={() => setNotificationsOpen(false)} />
        <LogsModal open={logsOpen} onClose={() => setLogsOpen(false)} />
        <ConfigurationModal open={configurationOpen} onClose={() => setConfigurationOpen(false)} />
        <MarketDataModal open={dataOpen} onClose={() => setDataOpen(false)} />
      </div>
      <ToastCenter position="top-right" />
      <NotificationWatcher />
    </div>
  );
}

export default AppShell;
