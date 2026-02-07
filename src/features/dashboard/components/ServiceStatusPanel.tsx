import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import clsx from 'clsx';
import styles from './ServiceStatusPanel.module.css';
import {
  SystemApiError,
  mapManagedServiceStatusResult,
  restartManagedService,
  type ManagedServiceRestartResult,
  type ManagedServiceStatusEntry,
  type ManagedServiceStatusListResponse,
  type ManagedServiceStatusResult
} from '@services/systemApi';
import { subscribeWebSocket, isAuthenticationFailureCloseEvent, type WebSocketSubscription } from '@services/websocketHub';
import { useAppDispatch, useAppSelector } from '@store/hooks';
import { addToast } from '@store/slices/toastSlice';
import { logout } from '@store/slices/authSlice';

const MANUAL_REFRESH_COOLDOWN_SECONDS = 5;

const serviceStatusLabelMap: Record<ManagedServiceStatusEntry['status'], string> = {
  online: '在线',
  degraded: '性能下降',
  offline: '离线',
  unknown: '未知'
};

const serviceStatusClassMap: Record<ManagedServiceStatusEntry['status'], string> = {
  online: styles.statusOnline,
  degraded: styles.statusDegraded,
  offline: styles.statusOffline,
  unknown: styles.statusUnknown
};

const formatRelativeTime = (value: string | null): string => {
  if (!value) {
    return '未知';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  const diffSeconds = Math.max(0, Math.round((Date.now() - date.getTime()) / 1000));
  if (diffSeconds < 60) {
    return `${diffSeconds}s 前`;
  }
  if (diffSeconds < 3600) {
    return `${Math.floor(diffSeconds / 60)}m 前`;
  }
  if (diffSeconds < 86400) {
    return `${Math.floor(diffSeconds / 3600)}h 前`;
  }
  return new Intl.DateTimeFormat('zh-CN', {
    hour12: false,
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date);
};

const formatLatency = (value: number | null): string => {
  if (value == null) {
    return '—';
  }
  if (value < 1000) {
    return `${Math.round(value)}ms`;
  }
  return `${(value / 1000).toFixed(2)}s`;
};

type RestartStateStatus = 'idle' | 'loading' | 'success' | 'error';

interface ServiceRestartState {
  status: RestartStateStatus;
  message: string | null;
  detail: string | null;
  finishedAt: number | null;
  result: ManagedServiceRestartResult | null;
}

const describeRestartResult = (result: ManagedServiceRestartResult | null): string | null => {
  if (!result) {
    return null;
  }
  if (result.detail) {
    return result.detail;
  }
  if (result.statusCode != null) {
    return `Docker API 状态 ${result.statusCode}`;
  }
  return `返回码 ${result.returnCode}`;
};

interface ServiceStatusWebSocketEnvelope {
  type?: string;
  event?: string;
  payload?: unknown;
  message?: string;
}

function ServiceStatusPanel() {
  const dispatch = useAppDispatch();
  const token = useAppSelector((state) => state.auth.token);
  const tokenRef = useRef<string | null>(token);
  const [services, setServices] = useState<ManagedServiceStatusEntry[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [manualCooldown, setManualCooldown] = useState<number>(0);
  const [nextRefreshTarget, setNextRefreshTarget] = useState<number | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [restartStates, setRestartStates] = useState<Record<string, ServiceRestartState>>({});
  const [expandedServices, setExpandedServices] = useState<Record<string, boolean>>({});
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const socketHandleRef = useRef<WebSocketSubscription | null>(null);

  const closeDropdown = useCallback(() => {
    setIsOpen(false);
  }, []);

  const toggleDropdown = useCallback(() => {
    setIsOpen((value) => !value);
  }, []);

  const onlineCount = useMemo(() => services.filter((service) => service.status === 'online').length, [
    services
  ]);
  const offlineCount = useMemo(() => Math.max(services.length - onlineCount, 0), [
    services.length,
    onlineCount
  ]);

  useEffect(() => {
    tokenRef.current = token;
  }, [token]);

  const applySnapshot = useCallback((result: ManagedServiceStatusResult) => {
    setServices(result.services);
    setFetchError(null);

    const nextSeconds = (() => {
      if (
        typeof result.cache.nextRefreshIn === 'number' &&
        Number.isFinite(result.cache.nextRefreshIn) &&
        result.cache.nextRefreshIn > 0
      ) {
        return result.cache.nextRefreshIn;
      }
      if (
        typeof result.cache.refreshInterval === 'number' &&
        Number.isFinite(result.cache.refreshInterval) &&
        result.cache.refreshInterval > 0
      ) {
        return result.cache.refreshInterval;
      }
      return null;
    })();

    if (nextSeconds != null) {
      setNextRefreshTarget(Date.now() + nextSeconds * 1000);
    } else {
      setNextRefreshTarget(null);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handleDocumentClick = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (target && containerRef.current?.contains(target)) {
        return;
      }
      closeDropdown();
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeDropdown();
      }
    };

    document.addEventListener('mousedown', handleDocumentClick);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleDocumentClick);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [closeDropdown, isOpen]);

  const handleSocketMessage = useCallback(
    (raw: string) => {
      let envelope: ServiceStatusWebSocketEnvelope;
      try {
        envelope = JSON.parse(raw) as ServiceStatusWebSocketEnvelope;
      } catch (error) {
        console.warn('无法解析服务状态推送：', raw, error);
        return;
      }

      if (envelope.type === 'event' && envelope.event === 'services.status') {
        const result = mapManagedServiceStatusResult(
          envelope.payload as ManagedServiceStatusListResponse | null | undefined
        );
        applySnapshot(result);
        return;
      }

      if (envelope.type === 'error') {
        const message =
          typeof envelope.message === 'string' && envelope.message
            ? envelope.message
            : '服务状态推送出现错误';
        setFetchError(message);
        setLoading(false);
      }
    },
    [applySnapshot]
  );

  useEffect(() => {
    if (!token) {
      setServices([]);
      setFetchError('未登录，无法获取服务状态');
      setLoading(false);
      closeDropdown();
      socketHandleRef.current?.dispose();
      socketHandleRef.current = null;
      return;
    }

    let disposed = false;
    setLoading(true);
    setFetchError(null);

    let handle: WebSocketSubscription | null = null;
    handle = subscribeWebSocket({
      name: 'ws',
      tokenProvider: () => tokenRef.current,
      onOpen: () => {
        if (disposed) {
          return;
        }
        setFetchError(null);
        setLoading(true);
        handle?.send({ action: 'subscribe', topics: ['services.status'] });
        handle?.send({ action: 'services.refresh' });
      },
      onMessage: handleSocketMessage,
      onError: () => {
        if (!disposed) {
          setFetchError('实时连接异常，正在重试…');
          setLoading(false);
          setNextRefreshTarget(null);
        }
      },
      onClose: (event) => {
        if (isAuthenticationFailureCloseEvent(event)) {
          dispatch(logout());
          return;
        }
        if (!disposed) {
          setFetchError('实时连接已断开，正在重试…');
          setLoading(true);
          setNextRefreshTarget(null);
        }
      }
    });

    socketHandleRef.current = handle;

    return () => {
      disposed = true;
      handle?.dispose();
      socketHandleRef.current = null;
    };
  }, [dispatch, handleSocketMessage, token, closeDropdown]);

  useEffect(() => {
    if (nextRefreshTarget == null) {
      setCountdown(null);
      return;
    }
    const updateCountdown = () => {
      const remaining = Math.max(0, Math.round((nextRefreshTarget - Date.now()) / 1000));
      setCountdown(remaining);
    };
    updateCountdown();
    const intervalId = window.setInterval(updateCountdown, 1000);
    return () => {
      window.clearInterval(intervalId);
    };
  }, [nextRefreshTarget]);

  useEffect(() => {
    if (manualCooldown <= 0) {
      return;
    }
    const intervalId = window.setInterval(() => {
      setManualCooldown((value) => {
        if (value <= 1) {
          window.clearInterval(intervalId);
          return 0;
        }
        return value - 1;
      });
    }, 1000);
    return () => {
      window.clearInterval(intervalId);
    };
  }, [manualCooldown]);

  useEffect(() => {
    setRestartStates((previous) => {
      const serviceNames = new Set(services.map((service) => service.name));
      const next: Record<string, ServiceRestartState> = {};
      let changed = false;
      for (const [name, state] of Object.entries(previous)) {
        if (serviceNames.has(name)) {
          next[name] = state;
        } else {
          changed = true;
        }
      }
      if (changed || Object.keys(next).length !== Object.keys(previous).length) {
        return next;
      }
      return previous;
    });
  }, [services]);

  const toggleServiceDetails = useCallback((serviceName: string) => {
    setExpandedServices((prev) => ({
      ...prev,
      [serviceName]: !prev[serviceName]
    }));
  }, []);

  const handleRestartService = useCallback(async (service: ManagedServiceStatusEntry) => {
    const serviceName = service.name;
    setRestartStates((prev) => ({
      ...prev,
      [serviceName]: {
        status: 'loading',
        message: '正在执行重启…',
        detail: null,
        finishedAt: null,
        result: null
      }
    }));
    try {
      const result = await restartManagedService(serviceName);
      const succeeded = result.succeeded;
      const message = succeeded ? '重启成功' : '重启失败';
      const detailMessage = describeRestartResult(result);
      setRestartStates((prev) => ({
        ...prev,
        [serviceName]: {
          status: succeeded ? 'success' : 'error',
          message,
          detail: detailMessage,
          finishedAt: Date.now(),
          result
        }
      }));
    } catch (error) {
      const message = error instanceof SystemApiError ? error.message : '重启失败';
      setRestartStates((prev) => ({
        ...prev,
        [serviceName]: {
          status: 'error',
          message,
          detail: null,
          finishedAt: Date.now(),
          result: null
        }
      }));
    }
  }, []);

  const handleManualRefresh = useCallback(() => {
    if (loading || manualCooldown > 0) {
      return;
    }
    const handle = socketHandleRef.current;
    if (!handle || !handle.isOpen()) {
      setFetchError('实时连接不可用，稍后重试');
      return;
    }
    const sent = handle.send({ action: 'services.refresh' });
    if (!sent) {
      setFetchError('实时连接不可用，稍后重试');
      return;
    }
    setFetchError(null);
    setManualCooldown(MANUAL_REFRESH_COOLDOWN_SECONDS);
    setLoading(true);
  }, [loading, manualCooldown]);

  const dropdownId = useId();
  const manualRefreshDisabled = loading || manualCooldown > 0;
  const isInitialLoading = loading && services.length === 0;

  return (
    <div className={styles.dropdownContainer} ref={containerRef}>
      <button
        type="button"
        className={clsx(styles.triggerButton, isOpen && styles.triggerButtonActive)}
        onClick={toggleDropdown}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-controls={dropdownId}
        aria-label="服务状态"
      >
        <span className={clsx(styles.countSegment, styles.countSegmentPositive)}>
          <span className={styles.countArrow} aria-hidden="true">
            ▲
          </span>
          <span className={styles.countValue}>{onlineCount}</span>
        </span>
        <span className={styles.countDivider} aria-hidden="true" />
        <span className={clsx(styles.countSegment, styles.countSegmentNegative)}>
          <span className={styles.countArrow} aria-hidden="true">
            ▼
          </span>
          <span className={styles.countValue}>{offlineCount}</span>
        </span>
      </button>
      {isOpen ? (
        <div className={styles.dropdown} id={dropdownId} role="menu">
          <div className={styles.dropdownHeader}>
            <div className={styles.dropdownTitle}>服务状态</div>
            <button
              type="button"
              className={clsx(styles.refreshButton, manualRefreshDisabled && styles.refreshButtonDisabled)}
              onClick={handleManualRefresh}
              disabled={manualRefreshDisabled}
            >
              {loading && manualCooldown === 0 ? '同步中…' : '刷新'}
            </button>
          </div>
          <div className={styles.dropdownBody}>
            {fetchError && !loading ? <div className={styles.fetchError}>{fetchError}</div> : null}
            {countdown != null ? (
              <div className={styles.metaLine}>下次刷新约 {countdown}s</div>
            ) : null}
            {manualCooldown > 0 ? (
              <div className={styles.metaLine}>手动刷新冷却中（{manualCooldown}s）</div>
            ) : null}
            {isInitialLoading ? <div className={styles.loading}>正在加载服务状态…</div> : null}
            {services.length === 0 && !loading && !fetchError ? (
              <div className={styles.empty}>暂无托管服务</div>
            ) : null}
            <div className={styles.serviceList}>
              {services.map((service, index) => {
                const restartInfo = service.restart;
                const restartState = restartStates[service.name];
                const restartButtonLabel = restartState?.status === 'loading' ? '重启中…' : '重启服务';
                const restartButtonClass = clsx(
                  styles.restartButton,
              restartState?.status === 'loading' && styles.restartButtonLoading
            );
            const restartDetail = restartState?.detail ?? describeRestartResult(restartState?.result ?? null);
            const restartTitle = !restartInfo?.available && restartInfo?.reason ? restartInfo.reason : undefined;
            const onRestartClick = () => {
              if (restartState?.status === 'loading') {
                return;
              }
              if (!restartInfo?.available) {
                dispatch(
                  addToast({
                    message: restartInfo?.reason ?? '未配置重启方式',
                    variant: 'info',
                    duration: 5000,
                    preventDuplicates: true
                  })
                );
                return;
              }
              void handleRestartService(service);
            };
            const metadataEntries = Object.entries(service.metadata ?? {});
            const isExpanded = expandedServices[service.name] ?? false;
            const detailId = `service-details-${index}`;
                return (
                  <div
                    key={service.name}
                    className={clsx(styles.serviceItem, isExpanded && styles.serviceItemExpanded)}
                  >
                <button
                  type="button"
                  className={clsx(styles.serviceRow, isExpanded && styles.serviceRowActive)}
                  onClick={() => toggleServiceDetails(service.name)}
                  aria-expanded={isExpanded}
                  aria-controls={detailId}
                >
                  <div className={styles.serviceRowHeader}>
                    <div className={styles.serviceRowTitle}>
                      <span className={styles.serviceRowName}>{service.name}</span>
                      <span className={clsx(styles.statusBadge, serviceStatusClassMap[service.status])}>
                        {serviceStatusLabelMap[service.status]}
                      </span>
                    </div>
                  </div>
                </button>
                {isExpanded ? (
                  <div id={detailId} className={styles.serviceDetails}>
                    <div className={styles.serviceDetailHeader}>
                      <div className={styles.serviceDetailTitle}>
                        <span className={styles.serviceDetailName}>{service.name}</span>
                        <span className={clsx(styles.statusBadge, serviceStatusClassMap[service.status])}>
                          {serviceStatusLabelMap[service.status]}
                        </span>
                      </div>
                      <button
                        type="button"
                        className={restartButtonClass}
                        onClick={onRestartClick}
                        disabled={restartState?.status === 'loading'}
                        title={restartTitle ?? undefined}
                      >
                        {restartButtonLabel}
                      </button>
                    </div>
                    <div className={styles.serviceMeta}>
                      <span>
                        <strong>响应</strong>
                        {formatLatency(service.latencyMs)}
                      </span>
                      <span>
                        <strong>HTTP</strong>
                        {service.statusCode ?? '—'}
                      </span>
                      <span>
                        <strong>检测</strong>
                        {formatRelativeTime(service.lastChecked)}
                      </span>
                      {service.healthUrl ? (
                        <span>
                          <strong>接口</strong>
                          <a href={service.healthUrl} target="_blank" rel="noreferrer">
                            打开
                          </a>
                        </span>
                      ) : null}
                      {service.logPath ? (
                        <span>
                          <strong>日志</strong>
                          {service.logPath}
                        </span>
                      ) : null}
                    </div>
                    {service.error ? <div className={styles.serviceError}>{service.error}</div> : null}
                    {metadataEntries.length > 0 ? (
                      <div className={styles.metadataList}>
                        {metadataEntries.map(([key, value]) => (
                          <span key={key} className={styles.metadataItem}>
                            <strong>{key}</strong>
                            {String(value)}
                          </span>
                        ))}
                      </div>
                    ) : null}
                    {restartState && restartState.status !== 'loading' ? (
                      <div className={styles.restartMessageContainer}>
                        <span
                          className={clsx(
                            styles.restartMessage,
                            restartState.status === 'success'
                              ? styles.restartSuccess
                              : styles.restartError
                          )}
                        >
                          {restartState.message}
                          {restartDetail ? ` · ${restartDetail}` : null}
                        </span>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
                );
              })}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default ServiceStatusPanel;
