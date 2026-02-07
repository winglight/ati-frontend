import type { ModelOpsOverviewPayload } from '@services/integration';
import { useTranslation } from '@i18n';
import styles from './ModelFusionCard.module.css';

interface ModelFusionCardProps {
  data?: ModelOpsOverviewPayload | null;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
}

const formatDateTime = (value?: string | null, locale?: string): string => {
  if (!value) {
    return '—';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString(locale ?? undefined, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });
};

const renderState = (message: string, isError = false, onRetry?: () => void, reloadLabel?: string) => (
  <div>
    <p className={`${styles.stateMessage} ${isError ? styles.error : ''}`}>{message}</p>
    {isError && onRetry ? (
      <button type="button" className={styles.retryButton} onClick={onRetry}>
        {reloadLabel ?? '重新加载'}
      </button>
    ) : null}
  </div>
);

function ModelFusionCard({ data, loading = false, error = null, onRetry }: ModelFusionCardProps) {
  const { t, i18n } = useTranslation();
  if (loading) {
    return (
      <section className={styles.card} aria-busy="true">
        <div className={styles.header}>
          <h3 className={styles.title}>{t('dashboard.model_fusion.title')}</h3>
          <span className={styles.status}>{t('dashboard.model_fusion.loading')}</span>
        </div>
        {renderState(t('dashboard.model_fusion.loading_detail'), false)}
      </section>
    );
  }

  if (error) {
    return (
      <section className={styles.card} aria-live="polite">
        <div className={styles.header}>
          <h3 className={styles.title}>{t('dashboard.model_fusion.title')}</h3>
          <span className={`${styles.status} ${styles.error}`}>{t('dashboard.model_fusion.load_failed')}</span>
        </div>
        {renderState(error, true, onRetry, t('dashboard.model_fusion.reload'))}
      </section>
    );
  }

  if (!data) {
    return (
      <section className={styles.card}>
        <div className={styles.header}>
          <h3 className={styles.title}>{t('dashboard.model_fusion.title')}</h3>
          <span className={styles.status}>{t('dashboard.model_fusion.no_data')}</span>
        </div>
        {renderState(t('dashboard.model_fusion.empty_hint'))}
      </section>
    );
  }

  const { activeModel, fusion, recentJobs, recentResults } = data;
  const metricsEntries = Object.entries(activeModel?.metrics ?? {}).slice(0, 3);
  const latestResult = recentResults[recentResults.length - 1] ?? null;
  const latestJob = recentJobs[0] ?? null;

  return (
    <section className={styles.card}>
      <div className={styles.header}>
        <h3 className={styles.title}>{t('dashboard.model_fusion.title')}</h3>
        <span className={styles.status}>
          {activeModel
            ? `${t('dashboard.model_fusion.active_version')}: ${activeModel.version}`
            : t('dashboard.model_fusion.inactive_model')}
        </span>
      </div>

      <div className={styles.metrics}>
        <div className={styles.metric}>
          <span className={styles.metricLabel}>{t('dashboard.model_fusion.metrics.fusion_strategy')}</span>
          <span className={styles.metricValue}>{fusion.strategy.toUpperCase()}</span>
        </div>
        <div className={styles.metric}>
          <span className={styles.metricLabel}>{t('dashboard.model_fusion.metrics.news_model')}</span>
          <span className={styles.metricValue}>{fusion.newsModelVersion ?? t('dashboard.model_fusion.metrics.unset')}</span>
        </div>
        <div className={styles.metric}>
          <span className={styles.metricLabel}>{t('dashboard.model_fusion.metrics.confidence_threshold')}</span>
          <span className={styles.metricValue}>{fusion.confidenceThreshold.toFixed(2)}</span>
        </div>
        <div className={styles.metric}>
          <span className={styles.metricLabel}>{t('dashboard.model_fusion.metrics.news_weight')}</span>
          <span className={styles.metricValue}>{fusion.newsWeight.toFixed(2)}</span>
        </div>
        {metricsEntries.map(([key, value]) => (
          <div key={key} className={styles.metric}>
            <span className={styles.metricLabel}>{key}</span>
            <span className={styles.metricValue}>{value.toFixed(3)}</span>
          </div>
        ))}
      </div>

      <div className={styles.jobList}>
        <div className={styles.jobItem}>
          <span>{t('dashboard.model_fusion.latest_job')}: </span>
          {latestJob ? (
            <span>
              <span className={styles.highlight}>
                {latestJob.jobType === 'training'
                  ? t('dashboard.model_fusion.job_type.training')
                  : t('dashboard.model_fusion.job_type.tuning')}
              </span>
              {' · '}
              {latestJob.status}
              {' · '}
              {formatDateTime(latestJob.submittedAt, i18n.language)}
            </span>
          ) : (
            <span>{t('dashboard.model_fusion.no_jobs')}</span>
          )}
        </div>
        <div className={styles.jobItem}>
          <span>{t('dashboard.model_fusion.latest_result')}: </span>
          {latestResult ? (
            <span>
              <span className={styles.highlight}>{latestResult.status}</span>
              {' · '}
              {formatDateTime(latestResult.timestamp, i18n.language)}
            </span>
          ) : (
            <span>{t('dashboard.model_fusion.no_result')}</span>
          )}
        </div>
        <div className={styles.jobItem}>
          <span>{t('dashboard.model_fusion.activation_time')}: </span>
          <span>{formatDateTime(activeModel?.activatedAt ?? null, i18n.language)}</span>
        </div>
      </div>
    </section>
  );
}

export default ModelFusionCard;
