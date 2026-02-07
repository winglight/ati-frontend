import { useRouteError } from 'react-router-dom';
import styles from './RouteError.module.css';
import { useTranslation } from 'react-i18next';

interface RouteErrorProps {
  status?: number;
  message?: string;
}

type RouterError = { status?: number; statusText?: string; message?: string } | undefined;

function useOptionalRouteError(): RouterError {
  try {
    return useRouteError() as RouterError;
  } catch (routeHookError) {
    const isDevEnvironment = Boolean(
      typeof import.meta !== 'undefined' &&
        (import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV
    );

    if (
      isDevEnvironment &&
      routeHookError instanceof Error &&
      routeHookError.message.includes('useRouteError must be used within a data router')
    ) {
      // Dev-only warning; keeping as-is to avoid noisy i18n in console.
      console.warn('RouteError 渲染在非 data router 环境中，退回到 props 提供的错误信息。');
    }

    return undefined;
  }
}

function RouteError({ status, message }: RouteErrorProps) {
  const { t } = useTranslation();
  const error = useOptionalRouteError();
  const effectiveStatus = status ?? error?.status ?? 500;
  const effectiveMessage =
    message ?? error?.statusText ?? error?.message ?? t('route_error.default_message');

  return (
    <div className={styles.wrapper}>
      <div className={styles.badge}>{effectiveStatus}</div>
      <div>
        <h2 className={styles.title}>{t('route_error.title')}</h2>
        <p className={styles.message}>{effectiveMessage}</p>
      </div>
    </div>
  );
}

export default RouteError;
