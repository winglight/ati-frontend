import clsx from 'clsx';
import Modal from './Modal';
import styles from './OrderDetailModal.module.css';
import type { OrderItem } from '@features/dashboard/types';
import { resolveOrderSourceLabel, resolveOrderStrategyLabel } from '../../utils/orderLabels';
import { formatLocalDateTime } from '../../utils/dateTime';
import { useTranslation } from '@i18n';
import type { TFunction } from 'i18next';

interface OrderDetailModalProps {
  open: boolean;
  order: OrderItem | null;
  onClose: () => void;
}

const formatTimestamp = (value: string | null | undefined): string =>
  formatLocalDateTime(value);

const formatNumber = (value: number | null | undefined, fractionDigits = 2): string => {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return '—';
  }
  return value.toFixed(fractionDigits);
};

const formatSignedNumber = (value: number | null | undefined): string => {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return '—';
  }
  const formatted = Math.abs(value).toFixed(2);
  if (value > 0) {
    return `+${formatted}`;
  }
  if (value < 0) {
    return `-${formatted}`;
  }
  return '0.00';
};

const formatDetailLabel = (key: string): string => {
  return key
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
};

const isTimestampKey = (key: string): boolean => /(time|date|timestamp)/i.test(key);

const formatDetailValue = (key: string, value: unknown, t: TFunction): string => {
  if (value === null || value === undefined) {
    return '—';
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value.toString() : '—';
  }
  if (typeof value === 'boolean') {
    return value ? t('common.boolean.yes') : t('common.boolean.no');
  }
  if (typeof value === 'string') {
    if (isTimestampKey(key)) {
      return formatTimestamp(value);
    }
    return value || '—';
  }
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
};

function OrderDetailModal({ open, order, onClose }: OrderDetailModalProps) {
  const { t } = useTranslation();
  const remaining =
    order && order.remaining !== undefined
      ? order.remaining
      : order
      ? Math.max(order.quantity - order.filled, 0)
      : 0;
  const sourceLabel = order ? resolveOrderSourceLabel(order) : '—';
  const strategyLabel = order ? resolveOrderStrategyLabel(order) : '—';

  const summaryCards = order
    ? [
        { label: t('modals.order_detail.summary.contract'), value: order.symbol ?? '—' },
        {
          label: t('modals.order_detail.summary.side_type'),
          value: `${order.side === 'buy' ? t('modals.order_entry.side.buy') : t('modals.order_entry.side.sell')} · ${
            order.type === 'market'
              ? t('modals.order_entry.type.market')
              : order.type === 'limit'
              ? t('modals.order_entry.type.limit')
              : t('modals.order_entry.type.stop')
          }`
        },
        { label: t('modals.order_detail.summary.quantity_filled_remaining'), value: `${order.quantity} / ${order.filled} / ${remaining}` },
        {
          label: t('modals.order_detail.summary.limit_price'),
          value:
            order.limitPrice !== null && order.limitPrice !== undefined
              ? formatNumber(order.limitPrice, 4)
              : order.price !== undefined
              ? formatNumber(order.price, 4)
              : t('modals.order_detail.market_label'),
          muted: order.limitPrice == null && order.price == null
        },
        {
          label: t('modals.order_detail.summary.fill_price'),
          value: formatNumber(order.fillPrice, 4),
          muted: order.fillPrice == null
        },
        { label: t('modals.order_detail.summary.status'), value: order.status ? t(`orders.status.${order.status}`) : '—' },
        {
          label: t('modals.order_detail.summary.pnl'),
          value: formatSignedNumber(order.pnl),
          valueClass:
            order.pnl === null || order.pnl === undefined
              ? styles.valueMuted
              : order.pnl > 0
              ? styles.valuePositive
              : order.pnl < 0
              ? styles.valueNegative
              : styles.valueMuted
        },
        {
          label: t('modals.order_detail.summary.realized_unrealized'),
          value: `${formatSignedNumber(order.realizedPnl)} / ${formatSignedNumber(order.unrealizedPnl)}`,
          muted: order.realizedPnl == null && order.unrealizedPnl == null
        },
        {
          label: t('modals.order_detail.summary.commission'),
          value: formatNumber(order.commission, 2),
          muted: order.commission == null
        },
        {
          label: t('modals.order_detail.summary.rejection_reason'),
          value: order.rejectionReason ?? '—',
          muted: !order.rejectionReason
        },
        { label: t('modals.order_detail.summary.origin'), value: sourceLabel, muted: sourceLabel === '—' },
        {
          label: t('modals.order_detail.summary.strategy_rule'),
          value: strategyLabel,
          muted: strategyLabel === '—'
        },
        {
          label: t('modals.order_detail.summary.exchange_security_type'),
          value: `${order.exchange ?? '—'} / ${order.secType ?? '—'}`,
          muted: !(order.exchange || order.secType)
        },
        { label: t('modals.order_detail.summary.account'), value: order.account ?? '—', muted: !order.account },
        { label: t('modals.order_detail.summary.ib_order_id'), value: order.ibOrderId ?? '—', muted: !order.ibOrderId },
        { label: t('modals.order_detail.summary.client_order_id'), value: order.clientOrderId ?? '—', muted: !order.clientOrderId },
        { label: t('modals.order_detail.summary.parent_order_id'), value: order.parentOrderId ?? '—', muted: !order.parentOrderId },
        { label: t('modals.order_detail.summary.created_at'), value: formatTimestamp(order.createdAt), muted: !order.createdAt },
        { label: t('modals.order_detail.summary.executed_at'), value: formatTimestamp(order.executedAt), muted: !order.executedAt },
        { label: t('modals.order_detail.summary.updated_at'), value: formatTimestamp(order.updatedAt), muted: !order.updatedAt }
      ]
    : [];

  const rawEntries =
    order && order.raw
      ? Object.entries(order.raw).sort(([a], [b]) => a.localeCompare(b))
      : [];

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={order ? t('modals.order_detail.title_with_id', { id: order.id }) : t('modals.order_detail.title')}
      subtitle={t('modals.order_detail.subtitle')}
      size="md"
    >
      {order ? (
        <div className={styles.container}>
          <div className={styles.summaryGrid}>
            {summaryCards.map(({ label, value, muted, valueClass }) => (
              <div key={label} className={styles.summaryCard}>
                <span className={styles.label}>{label}</span>
                <span
                  className={clsx(
                    styles.value,
                    muted && styles.valueMuted,
                    valueClass && valueClass
                  )}
                >
                  {value}
                </span>
              </div>
            ))}
          </div>

          {rawEntries.length ? (
            <>
              <h4 className={styles.sectionTitle}>{t('modals.order_detail.raw_section_title')}</h4>
              <dl className={styles.detailList}>
                {rawEntries.map(([key, value]) => (
                  <div key={key} className={styles.detailItem}>
                    <dt className={styles.detailKey}>{formatDetailLabel(key)}</dt>
                    <dd className={styles.detailValue}>{formatDetailValue(key, value, t)}</dd>
                  </div>
                ))}
              </dl>
            </>
          ) : null}
        </div>
      ) : null}
    </Modal>
  );
}

export default OrderDetailModal;
