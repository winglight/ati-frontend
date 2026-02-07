import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import i18n from '@i18n';
import clsx from 'clsx';
import PageHeader from './components/PageHeader';
import LoadingIndicator from '@components/layout/LoadingIndicator';
import RouteError from '@components/layout/RouteError';
import layoutStyles from './PageLayout.module.css';
import styles from './DocumentationPage.module.css';
import { useAppDispatch, useAppSelector } from '@store/hooks';
import { loadDocumentation } from '@store/thunks/loadDocumentation';
import type { ServiceDocEntry } from '@services/documentationApi';
import DocsAuthSettings from './components/DocsAuthSettings';
import ApiOperationExplorer from './components/ApiOperationExplorer';
import WebSocketTester from './components/WebSocketTester';

const AUTH_HEADER_NAME_KEY = 'docs.auth.headerName';
const AUTH_HEADER_VALUE_KEY = 'docs.auth.headerValue';

const getLocale = (): string => {
  const lng = i18n.language;
  return lng === 'zh' ? 'zh-CN' : 'en-US';
};

const formatTimestamp = (value: string | null): string => {
  if (!value) {
    return '—';
  }
  try {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return value;
    }
    return new Intl.DateTimeFormat(getLocale(), {
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

const kindLabel = (entry: ServiceDocEntry, t: (key: string) => string): string => {
  if (entry.kind === 'application') {
    return t('settings.kind.application');
  }
  if (entry.kind === 'gateway') {
    return t('settings.kind.gateway');
  }
  return t('settings.kind.service');
};

const buildStatusClass = (entry: ServiceDocEntry): string => {
  if (entry.status === 'online') {
    return styles.statusOnline;
  }
  if (entry.status === 'error') {
    return styles.statusError;
  }
  if (entry.status === 'stale') {
    return styles.statusStale;
  }
  return styles.statusUnknown;
};

const formatSummaryValue = (value: number | undefined | null): string => {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return '0';
  }
  return value.toLocaleString(getLocale());
};

type HeaderAction = {
  label: string;
  variant: 'primary' | 'outline';
  onClick: () => void;
  disabled: boolean;
};

function DocumentationPage() {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const { status, summary, services, generatedAt, raw, error } = useAppSelector(
    (state) => state.documentation
  );
  const [authHeaderName, setAuthHeaderName] = useState<string>(() => {
    if (typeof window === 'undefined') {
      return 'Authorization';
    }
    return window.localStorage.getItem(AUTH_HEADER_NAME_KEY) ?? 'Authorization';
  });
  const [authHeaderValue, setAuthHeaderValue] = useState<string>(() => {
    if (typeof window === 'undefined') {
      return '';
    }
    return window.localStorage.getItem(AUTH_HEADER_VALUE_KEY) ?? '';
  });

  useEffect(() => {
    if (status === 'idle') {
      void dispatch(loadDocumentation());
    }
  }, [dispatch, status]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    window.localStorage.setItem(AUTH_HEADER_NAME_KEY, authHeaderName);
  }, [authHeaderName]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    window.localStorage.setItem(AUTH_HEADER_VALUE_KEY, authHeaderValue);
  }, [authHeaderValue]);

  const headerActions = useMemo<HeaderAction[]>(() => {
    const actions: HeaderAction[] = [
      {
        label: t('documentation.actions.refresh'),
        variant: 'outline' as const,
        onClick: () => {
          void dispatch(loadDocumentation());
        },
        disabled: status === 'loading'
      }
    ];

    actions.push({
      label: t('documentation.actions.download_json'),
      variant: 'primary' as const,
      onClick: () => {
        if (!raw) {
          return;
        }
        const blob = new Blob([JSON.stringify(raw, null, 2)], {
          type: 'application/json'
        });
        const timestamp = generatedAt ? generatedAt.replace(/[:T]/g, '-').replace(/\..+$/, '') : 'latest';
        const filename = `openapi-aggregate-${timestamp}.json`;
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = filename;
        anchor.click();
        URL.revokeObjectURL(url);
      },
      disabled: !raw
    });

    return actions;
  }, [dispatch, generatedAt, raw, status, t]);

  if (status === 'loading' && services.length === 0) {
    return <LoadingIndicator message={t('documentation.loading')} />;
  }

  if (status === 'failed' && services.length === 0) {
    return <RouteError status={503} message={error ?? t('documentation.error_load_failed')} />;
  }

  const summaryStats = [
    { label: t('documentation.summary.service_count'), value: formatSummaryValue(summary?.serviceCount) },
    { label: t('documentation.summary.online_count'), value: formatSummaryValue(summary?.onlineCount) },
    { label: t('documentation.summary.path_count'), value: formatSummaryValue(summary?.totalPathCount) },
    { label: t('documentation.summary.operation_count'), value: formatSummaryValue(summary?.totalOperationCount) }
  ];

  const generatedLabel = generatedAt ? formatTimestamp(generatedAt) : '—';
  const uniqueTags = summary?.uniqueTags ?? [];
  const showEmptyState = services.length === 0;
  const showErrorBanner = status === 'failed' && services.length > 0 && error;
  const trimmedHeaderName = authHeaderName.trim();
  const hasAuthHeader = Boolean(trimmedHeaderName && authHeaderValue);
  const authHeader = hasAuthHeader
    ? {
        name: trimmedHeaderName,
        value: authHeaderValue
      }
    : null;

  return (
    <div className={layoutStyles.page}>
      <PageHeader
        title={t('documentation.page.title')}
        description={t('documentation.page.description')}
        actions={headerActions}
      />
      <div className={styles.pageContent}>
        <section className={styles.summaryHeader}>
          <div className={styles.summaryTimestamp}>{t('documentation.summary.generated_at_prefix')} {generatedLabel}</div>
          {showErrorBanner ? <div className={styles.errorBanner}>{error}</div> : null}
          {uniqueTags.length > 0 ? (
            <div className={styles.tagsWrapper}>
              {uniqueTags.map((tag) => (
                <span key={tag} className={styles.tag}>
                  {tag}
                </span>
              ))}
            </div>
          ) : null}
        </section>

        <div className={styles.summaryGrid}>
          {summaryStats.map((item) => (
            <div key={item.label} className={styles.summaryCard}>
              <span className={styles.summaryLabel}>{item.label}</span>
              <span className={styles.summaryValue}>{item.value}</span>
            </div>
          ))}
        </div>

        <section className={styles.serviceTableWrapper}>
          {showEmptyState ? (
            <div className={styles.emptyState}>{t('documentation.empty')}</div>
          ) : (
            <table className={styles.serviceTable}>
              <thead>
                <tr>
                  <th>{t('documentation.table.name')}</th>
                  <th>{t('documentation.table.status')}</th>
                  <th>{t('documentation.table.paths')}</th>
                  <th>{t('documentation.table.operations')}</th>
                  <th>{t('documentation.table.tags')}</th>
                  <th>{t('documentation.table.last_synced')}</th>
                </tr>
              </thead>
              <tbody>
                {services.map((service) => {
                  const statusClass = clsx(styles.statusBadge, buildStatusClass(service));
                  const tags = service.summary?.tags ?? [];
                  const displayTags = tags.slice(0, 4);
                  return (
                    <tr key={`${service.kind}-${service.name}`} className={styles.serviceRow}>
                      <td>
                        <div className={styles.serviceName}>{service.name}</div>
                        <div className={styles.serviceMeta}>
                          <span>{kindLabel(service, t)}</span>
                          {service.url ? (
                            <a
                              href={service.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className={styles.link}
                            >
                              {t('documentation.buttons.open_json')}
                            </a>
                          ) : (
                            <span>{t('documentation.labels.doc_url_missing')}</span>
                          )}
                          {service.error ? <span>{t('documentation.error_prefix')} {service.error}</span> : null}
                        </div>
                      </td>
                      <td>
                        <span className={statusClass}>{service.status}</span>
                      </td>
                      <td>{service.summary ? formatSummaryValue(service.summary.pathCount) : '—'}</td>
                      <td>{service.summary ? formatSummaryValue(service.summary.operationCount) : '—'}</td>
                      <td>
                        {displayTags.length > 0 ? (
                          <div className={styles.tagsWrapper}>
                            {displayTags.map((tag) => (
                              <span key={tag} className={styles.tag}>
                                {tag}
                              </span>
                            ))}
                            {tags.length > displayTags.length ? <span>…</span> : null}
                          </div>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td>{formatTimestamp(service.fetchedAt)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </section>

        <DocsAuthSettings
          headerName={authHeaderName}
          headerValue={authHeaderValue}
          onChange={(name, value) => {
            setAuthHeaderName(name);
            setAuthHeaderValue(value);
          }}
          onReset={() => {
            setAuthHeaderName('Authorization');
            setAuthHeaderValue('');
          }}
        />

        <ApiOperationExplorer services={services} authHeader={authHeader} />

        <WebSocketTester authHeader={authHeader} />
      </div>
    </div>
  );
}

export default DocumentationPage;
