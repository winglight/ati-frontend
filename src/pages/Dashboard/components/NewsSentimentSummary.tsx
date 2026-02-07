import { Link } from 'react-router-dom';
import type { NewsOverviewPayload } from '@services/integration';
import { useTranslation } from '@i18n';
import styles from './NewsSentimentSummary.module.css';

interface NewsSentimentSummaryProps {
  data?: NewsOverviewPayload | null;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
}

const formatSentiment = (value: number): JSX.Element => {
  if (Number.isNaN(value)) {
    return <span className={styles.sentimentPositive}>0.00</span>;
  }
  const formatted = value.toFixed(2);
  if (value > 0.01) {
    return <span className={styles.sentimentPositive}>+{formatted}</span>;
  }
  if (value < -0.01) {
    return <span className={styles.sentimentNegative}>{formatted}</span>;
  }
  return <span className={styles.sentimentPositive}>0.00</span>;
};

const renderState = (message: string, isError = false, onRetry?: () => void, reloadLabel?: string) => (
  <div>
    <p className={`${styles.stateMessage} ${isError ? styles.error : ''}`}>{message}</p>
    {isError && onRetry ? (
      <button type="button" className={styles.linkButton} onClick={onRetry}>
        {reloadLabel ?? '重新加载'}
      </button>
    ) : null}
  </div>
);

function NewsSentimentSummary({ data, loading = false, error = null, onRetry }: NewsSentimentSummaryProps) {
  const { t } = useTranslation();
  if (loading) {
    return (
      <section className={styles.card} aria-busy="true">
        <div className={styles.header}>
          <h3 className={styles.title}>{t('dashboard.news_summary.title')}</h3>
          <span className={styles.linkButton}>{t('dashboard.news_summary.loading')}</span>
        </div>
        {renderState(t('dashboard.news_summary.loading_detail'))}
      </section>
    );
  }

  if (error) {
    return (
      <section className={styles.card} aria-live="polite">
        <div className={styles.header}>
          <h3 className={styles.title}>{t('dashboard.news_summary.title')}</h3>
        </div>
        {renderState(error, true, onRetry, t('dashboard.news_summary.reload'))}
      </section>
    );
  }

  if (!data) {
    return (
      <section className={styles.card}>
        <div className={styles.header}>
          <h3 className={styles.title}>{t('dashboard.news_summary.title')}</h3>
        </div>
        {renderState(t('dashboard.news_summary.empty_hint'))}
      </section>
    );
  }

  const { activeModel, symbolHeat, topHeadlines, recentSignals, pendingTrainingJobs } = data;
  const topSymbols = symbolHeat.slice(0, 3);
  const signals = recentSignals.slice(-3);
  const latestHeadline = topHeadlines[0] ?? null;

  return (
    <section className={styles.card}>
      <div className={styles.header}>
        <h3 className={styles.title}>{t('dashboard.news_summary.title')}</h3>
        <Link to="/news-workbench" className={styles.linkButton}>
          {t('dashboard.news_summary.view_details')}
        </Link>
      </div>

      <div className={styles.list}>
        <div className={styles.listItem}>
          <span>{t('dashboard.news_summary.active_model')}: </span>
          <span>{activeModel ? activeModel.version : t('dashboard.news_summary.inactive')}</span>
        </div>
        <div className={styles.listItem}>
          <span>{t('dashboard.news_summary.pending_training_jobs')}: </span>
          <span>{pendingTrainingJobs}</span>
        </div>
        <div className={styles.listItem}>
          <span>{t('dashboard.news_summary.hot_list')}: </span>
          <span>
            {topSymbols.length > 0
              ? topSymbols.map((entry) => `${entry.symbol}(${entry.articles})`).join(' · ')
              : t('dashboard.news_summary.no_data')}
          </span>
        </div>
        <div className={styles.listItem}>
          <span>{t('dashboard.news_summary.focus_event')}: </span>
          <span>{latestHeadline ? latestHeadline.title : t('dashboard.news_summary.none')}</span>
        </div>
      </div>

      <div className={styles.signalList}>
        {signals.length > 0 ? (
          signals.map((signal) => (
            <div key={signal.id} className={styles.signalCard}>
              <span className={styles.signalLabel}>{signal.modelVersion}</span>
              <span className={styles.signalValue}>{formatSentiment(signal.probability)}</span>
              <span className={styles.signalLabel}>{signal.symbols.join(', ') || t('dashboard.news_summary.untagged')}</span>
            </div>
          ))
        ) : (
          <span className={styles.empty}>{t('dashboard.news_summary.no_realtime_signals')}</span>
        )}
      </div>
    </section>
  );
}

export default NewsSentimentSummary;
