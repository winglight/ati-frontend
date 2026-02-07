import styles from './LoadingIndicator.module.css';
import { useTranslation } from 'react-i18next';

interface LoadingIndicatorProps {
  message?: string;
}

function LoadingIndicator({ message }: LoadingIndicatorProps) {
  const { t } = useTranslation();
  const effectiveMessage = message ?? t('common.loading');
  return (
    <div className={styles.wrapper} role="status" aria-live="polite">
      <div className={styles.spinner} />
      <span className={styles.message}>{effectiveMessage}</span>
    </div>
  );
}

export default LoadingIndicator;
