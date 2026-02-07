import { useEffect, useMemo, type ReactNode } from 'react';
import PageHeader from './components/PageHeader';
import LoadingIndicator from '@components/layout/LoadingIndicator';
import RouteError from '@components/layout/RouteError';
import layoutStyles from './PageLayout.module.css';
import styles from './SettingsPage.module.css';
import { useAppDispatch, useAppSelector } from '@store/hooks';
import { loadServiceStatuses, loadSystemInfo } from '@store/thunks/system';
import { useTranslation } from 'react-i18next';
import i18next from 'i18next';

const formatTimestamp = (value: string | null | undefined): string => {
  if (!value) {
    return '—';
  }
  try {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return value;
    }
    const lang = i18next.language || 'zh';
    const locale = lang.startsWith('zh') ? 'zh-CN' : 'en-US';
    return new Intl.DateTimeFormat(locale, {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    }).format(date);
  } catch (error) {
    console.warn('格式化时间失败', error);
    return value;
  }
};

const formatBoolean = (value: boolean | undefined): string => (value ? i18next.t('common.on') : i18next.t('common.off'));

const statusLabel = (status: 'online' | 'error' | 'unknown'): string => {
  if (status === 'online') {
    return i18next.t('settings.status.online');
  }
  if (status === 'error') {
    return i18next.t('settings.status.error');
  }
  return i18next.t('settings.status.unknown');
};

const statusClassName = (status: 'online' | 'error' | 'unknown'): string => {
  if (status === 'online') {
    return styles.statusOnline;
  }
  if (status === 'error') {
    return styles.statusError;
  }
  return styles.statusUnknown;
};

// Removed unused legacy kindLabel; replaced by i18n-aware getKindLabel below.

interface InfoItem {
  label: string;
  value: ReactNode;
}

function SettingsPage() {
  const dispatch = useAppDispatch();
  const { info, services, infoStatus, servicesStatus, infoError, servicesError, infoUpdatedAt, servicesUpdatedAt } =
    useAppSelector((state) => state.system);
  const { t } = useTranslation();
  const getKindLabel = (kind: 'application' | 'gateway' | 'service'): string => {
    if (kind === 'application') return t('settings.kind.application');
    if (kind === 'gateway') return t('settings.kind.gateway');
    return t('settings.kind.service');
  };

  useEffect(() => {
    if (infoStatus === 'idle') {
      void dispatch(loadSystemInfo());
    }
  }, [dispatch, infoStatus]);

  useEffect(() => {
    if (servicesStatus === 'idle') {
      void dispatch(loadServiceStatuses());
    }
  }, [dispatch, servicesStatus]);

  const refreshing = infoStatus === 'loading' || servicesStatus === 'loading';

  const headerActions = useMemo(() => {
    return [
      {
        label: t('settings.refresh'),
        variant: 'outline' as const,
        onClick: () => {
          void dispatch(loadSystemInfo());
          void dispatch(loadServiceStatuses());
        },
        disabled: refreshing
      }
    ];
  }, [dispatch, refreshing, t]);

  const initialLoading = !info && !services.length && (infoStatus === 'loading' || servicesStatus === 'loading');
  if (initialLoading) {
    return <LoadingIndicator message={t('settings.loading_info')} />;
  }

  if (!info && infoStatus === 'failed') {
    return <RouteError status={503} message={infoError ?? t('settings.error_load_info')} />;
  }

  const infoItems: InfoItem[] = [
    { label: t('settings.info.name'), value: info?.name ?? '—' },
    { label: t('settings.info.version'), value: info?.version ?? '—' },
    { label: t('settings.info.debug'), value: info ? formatBoolean(info.debug) : '—' },
    {
      label: t('settings.info.openapi'),
      value: info?.openapiUrl ? (
        <a href={info.openapiUrl} target="_blank" rel="noreferrer" className={styles.link}>
          {info.openapiUrl}
        </a>
      ) : (
        '—'
      )
    },
    {
      label: t('settings.info.swagger'),
      value: info?.docsUrl ? (
        <a href={info.docsUrl} target="_blank" rel="noreferrer" className={styles.link}>
          {info.docsUrl}
        </a>
      ) : (
        '—'
      )
    },
    {
      label: t('settings.info.redoc'),
      value: info?.redocUrl ? (
        <a href={info.redocUrl} target="_blank" rel="noreferrer" className={styles.link}>
          {info.redocUrl}
        </a>
      ) : (
        '—'
      )
    },
    { label: t('settings.info.last_updated'), value: formatTimestamp(infoUpdatedAt ?? info?.timestamp) }
  ];

  const servicesEmpty = services.length === 0;

  return (
    <div className={layoutStyles.page}>
      <PageHeader
        title={t('settings.page.title')}
        description={t('settings.page.description')}
        actions={headerActions}
      />
      <div className={styles.pageContent}>
        <section className={styles.systemSection}>
          {infoStatus === 'failed' && info ? <div className={styles.errorBanner}>{infoError}</div> : null}
          <div className={styles.infoGrid}>
            {infoItems.map((item) => (
              <div key={item.label} className={styles.infoCard}>
                <span className={styles.cardLabel}>{item.label}</span>
                <span className={styles.cardValue}>{item.value}</span>
              </div>
            ))}
          </div>
        </section>
        <section className={styles.servicesSection}>
          <div className={styles.servicesHeader}>
            <h2>{t('settings.services.title')}</h2>
            <div className={styles.timestamp}>{t('settings.services.last_refresh_prefix')}{formatTimestamp(servicesUpdatedAt ?? null)}</div>
          </div>
          {servicesStatus === 'failed' ? <div className={styles.errorBanner}>{servicesError}</div> : null}
          {servicesEmpty ? (
            <div className={styles.emptyState}>{t('settings.services.empty')}</div>
          ) : (
            <div className={styles.tableWrapper}>
              <table className={styles.servicesTable}>
                <thead>
                  <tr>
                    <th>{t('settings.services.table.name')}</th>
                    <th>{t('settings.services.table.type')}</th>
                    <th>{t('settings.services.table.status')}</th>
                    <th>{t('settings.services.table.doc')}</th>
                    <th>{t('settings.services.table.fetched_at')}</th>
                    <th>{t('settings.services.table.error')}</th>
                  </tr>
                </thead>
                <tbody>
                  {services.map((service) => (
                    <tr key={`${service.name}-${service.kind}`}>
                      <td>{service.name}</td>
                      <td>{getKindLabel(service.kind)}</td>
                      <td>
                        <span className={`${styles.statusBadge} ${statusClassName(service.status)}`}>
                          {statusLabel(service.status)}
                        </span>
                      </td>
                      <td>
                        {service.url ? (
                          <a href={service.url} target="_blank" rel="noreferrer" className={styles.link}>
                            {service.url}
                          </a>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td>{formatTimestamp(service.fetchedAt)}</td>
                      <td>{service.error ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

export default SettingsPage;
