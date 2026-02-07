import { useMemo, useState } from 'react';
import { useTranslation } from '@i18n';
import clsx from 'clsx';
import PanelCard, { PanelAction } from './PanelCard';
import styles from './AccountSummaryCard.module.css';
import { AccountSummary } from '../types';

interface AccountSummaryCardProps {
  account: AccountSummary;
  onRefresh?: () => void;
  onViewDetails?: () => void;
  onViewAnalytics?: () => void;
}

function formatCurrency(value: number, currency: string | null | undefined) {
  const symbol = currency && currency.trim() ? currency.trim().toUpperCase() : 'USD';
  return value.toLocaleString('en-US', {
    style: 'currency',
    currency: symbol,
    maximumFractionDigits: 2
  });
}

function formatCurrencyTitle(value: number, currency: string | null | undefined) {
  const symbol = currency && currency.trim() ? currency.trim().toUpperCase() : 'USD';
  return value.toLocaleString('en-US', {
    style: 'currency',
    currency: symbol,
    minimumFractionDigits: 2,
    maximumFractionDigits: 6
  });
}

function AccountSummaryCard({ account, onRefresh, onViewDetails, onViewAnalytics }: AccountSummaryCardProps) {
  const { t, i18n } = useTranslation();
  const [showAccountId, setShowAccountId] = useState(false);

  const maskedAccountId = useMemo(() => {
    const id = account.accountId ?? '';
    const visible = 2;
    if (id.length <= visible) return id;
    return `${id.slice(0, visible)}${'*'.repeat(id.length - visible)}`;
  }, [account.accountId]);

  const actions: PanelAction[] = [
    onViewAnalytics ? { label: t('dashboard.account.actions.analytics'), onClick: onViewAnalytics } : null,
    onRefresh ? { label: t('dashboard.account.actions.refresh'), onClick: onRefresh } : null,
    onViewDetails ? { label: t('dashboard.account.actions.view_details'), onClick: onViewDetails } : null
  ].filter(Boolean) as PanelAction[];

  const metricItems: Array<{
    key: string;
    label: string;
    value: string;
    title?: string;
    variant?: 'default' | 'strong' | 'pnl' | 'accent';
    positive?: boolean;
  }> = [
    {
      key: 'equity',
      label: t('dashboard.account.metrics.equity'),
      value: formatCurrency(account.equity, account.currency),
      title: formatCurrencyTitle(account.equity, account.currency),
      variant: 'strong'
    },
    {
      key: 'balance',
      label: t('dashboard.account.metrics.balance'),
      value: formatCurrency(account.balance, account.currency),
      title: formatCurrencyTitle(account.balance, account.currency)
    },
    {
      key: 'available',
      label: t('dashboard.account.metrics.available'),
      value: formatCurrency(account.available, account.currency),
      title: formatCurrencyTitle(account.available, account.currency)
    },
    {
      key: 'marginUsed',
      label: t('dashboard.account.metrics.margin_used'),
      value: formatCurrency(account.marginUsed, account.currency),
      title: formatCurrencyTitle(account.marginUsed, account.currency)
    },
    {
      key: 'pnlRealized',
      label: t('dashboard.account.metrics.realized_pnl'),
      value: formatCurrency(account.pnlRealized, account.currency),
      title: formatCurrencyTitle(account.pnlRealized, account.currency),
      variant: 'pnl',
      positive: account.pnlRealized >= 0
    },
    {
      key: 'pnlUnrealized',
      label: t('dashboard.account.metrics.unrealized_pnl'),
      value: formatCurrency(account.pnlUnrealized, account.currency),
      title: formatCurrencyTitle(account.pnlUnrealized, account.currency),
      variant: 'pnl',
      positive: account.pnlUnrealized >= 0
    }
  ];

  const metricRows = [] as Array<typeof metricItems>;
  for (let i = 0; i < metricItems.length; i += 2) {
    metricRows.push(metricItems.slice(i, i + 2));
  }

  return (
    <PanelCard title={t('dashboard.account.title')} actions={actions} className={styles.card} dense>
      <div className={styles.metaRow}>
        <div className={styles.accountGroup}>
          <div className={styles.accountId}>{t('dashboard.account.labels.account')}：{showAccountId ? account.accountId : maskedAccountId}</div>
          <button
            type="button"
            className={styles.visibilityToggle}
            onClick={() => setShowAccountId((v) => !v)}
            aria-pressed={showAccountId}
            aria-label={showAccountId ? t('dashboard.account.visibility.hide') : t('dashboard.account.visibility.show')}
            title={showAccountId ? t('dashboard.account.visibility.hide') : t('dashboard.account.visibility.show')}
          >
            {/* eye / eye-off icon */}
            {showAccountId ? (
              <svg viewBox="0 0 24 24" className={styles.eyeIcon} aria-hidden="true">
                <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" fill="none" stroke="currentColor" strokeWidth="1.5"/>
                <path d="M12 9a3 3 0 1 1 0 6 3 3 0 0 1 0-6z" fill="none" stroke="currentColor" strokeWidth="1.5"/>
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" className={styles.eyeIcon} aria-hidden="true">
                <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" fill="none" stroke="currentColor" strokeWidth="1.5"/>
                <path d="M3 3l18 18" fill="none" stroke="currentColor" strokeWidth="1.5"/>
              </svg>
            )}
          </button>
        </div>
        {account.currency ? <div className={styles.currency}>{t('dashboard.account.labels.currency')}：{account.currency}</div> : null}
      </div>
      <table className={styles.metricsTable}>
        <tbody>
          {metricRows.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {row.map((item) => (
                <td key={item.key}>
                  <div className={styles.metricCell}>
                    <span className={styles.label}>{item.label}</span>
                    <span
                      className={clsx({
                        [styles.metricValue]: !item.variant || item.variant === 'default',
                        [styles.metricValueStrong]: item.variant === 'strong',
                        [styles.metricValuePnl]: item.variant === 'pnl',
                        [styles.metricValueAccent]: item.variant === 'accent'
                      })}
                      data-positive={item.variant === 'pnl' ? item.positive !== false : undefined}
                      title={item.title}
                    >
                      {item.value}
                    </span>
                  </div>
                </td>
              ))}
              {row.length < 2
                ? Array.from({ length: 2 - row.length }).map((_, index) => <td key={`empty-${index}`} />)
                : null}
            </tr>
          ))}
        </tbody>
      </table>
      <div className={styles.timestamp}>{t('dashboard.account.last_updated_prefix')}{new Date(account.updatedAt).toLocaleString(i18n.language)}</div>
    </PanelCard>
  );
}

export default AccountSummaryCard;
