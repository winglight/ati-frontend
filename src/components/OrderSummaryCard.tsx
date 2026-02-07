import clsx from 'clsx';
import type { OrderItem } from '@features/dashboard/types';
import { formatLocalDateTime } from '../utils/dateTime';
import { normalizeTimestampToUtc } from '../utils/timezone';
import { useTranslation } from '@i18n';
import { resolveOrderOriginLabel, resolveOrderActionStatus } from '../utils/orderLabels';
import styles from './OrderSummaryCard.module.css';

interface OrderSummaryCardProps {
  order: OrderItem;
  onSelectSymbol?: (symbol: string) => void;
  onViewDetail?: (order: OrderItem) => void;
  onCancel?: (order: OrderItem) => void;
  cancelling?: boolean;
}

const statusClassMap: Record<OrderItem['status'], keyof typeof styles> = {
  working: 'statusWorking',
  pending: 'statusPending',
  filled: 'statusFilled',
  cancelled: 'statusCancelled',
  rejected: 'statusInactive',
  inactive: 'statusInactive'
};

const isCancellable = (order: OrderItem): boolean =>
  order.status === 'working' || order.status === 'pending';

const formatNumber = (value: number | null | undefined, fractionDigits = 2): string => {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return '—';
  }
  return value.toFixed(fractionDigits);
};

const formatSignedNumber = (value: number | null | undefined, fractionDigits = 2): string => {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return '—';
  }
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(fractionDigits)}`;
};

const formatShortDateTime = (value: string | null | undefined, locale?: string): string =>
  formatLocalDateTime(value, locale, true);

const ensureUtc = (value: string | null | undefined): string | null | undefined => {
  if (!value) return value;
  if (/(Z|[+-]\d{2}:?\d{2})$/.test(value)) {
    return value;
  }
  return `${value}Z`;
};

const normalizeToIsoString = (value: string | null | undefined): string | null => {
  if (!value) return null;
  const normalized = normalizeTimestampToUtc(value);
  if (normalized) return normalized;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
};

const buildLineItems = (
  items: Array<{ key: string; text: string; className?: string } | null | undefined>
) =>
  items.filter((item): item is { key: string; text: string; className?: string } => Boolean(item));

function OrderSummaryCard({
  order,
  onSelectSymbol,
  onViewDetail,
  onCancel,
  cancelling
}: OrderSummaryCardProps) {
  const { t, i18n } = useTranslation();
  const statusClass = statusClassMap[order.status] ?? statusClassMap.working;
  const statusLabel = t(`dashboard.orders.card.status.${order.status}`);
  const cancellable = onCancel ? isCancellable(order) : false;

  const cardClass = clsx(styles.card, {
    [styles.cardFilledBuy]: order.status === 'filled' && order.side === 'buy',
    [styles.cardFilledSell]: order.status === 'filled' && order.side === 'sell',
    [styles.cardPending]: order.status === 'pending' || order.status === 'working',
    [styles.cardInactive]:
      order.status === 'cancelled' || order.status === 'rejected' || order.status === 'inactive'
  });

  const quantityValue = Math.abs(order.quantity ?? 0);
  const remainingValue = order.remaining !== undefined && order.remaining !== null
    ? order.remaining
    : Math.max(quantityValue - (order.filled ?? 0), 0);
  const symbolLabel = order.symbol || '—';
  const sideText = order.side === 'buy' ? t('dashboard.orders.card.side.buy') : t('dashboard.orders.card.side.sell');
  const typeLabel = order.type === 'market' ? t('dashboard.orders.card.order_type.market') : order.type.toUpperCase();
  const entryPrice =
    order.type === 'market'
      ? order.fillPrice ?? null
      : order.limitPrice ?? order.price ?? order.stopPrice ?? null;

  const typeSummary =
    entryPrice === null || entryPrice === undefined
      ? typeLabel
      : `${typeLabel}@${formatNumber(entryPrice, 2)}`;
  const lineOne = buildLineItems([
    { key: 'summary', text: `${sideText} ${quantityValue} / ${order.filled} / ${remainingValue} ${symbolLabel}` },
    { key: 'type', text: typeSummary }
  ]);

  // PnL & Commission row
  const pnlText = `${t('dashboard.orders.card.pnl_prefix')}${formatSignedNumber(order.pnl)}`;
  const pnlClassName =
    order.pnl === null || order.pnl === undefined || !Number.isFinite(order.pnl as number)
      ? styles.textMuted
      : order.pnl > 0
      ? styles.textPositive
      : order.pnl < 0
      ? styles.textNegative
      : styles.textMuted;

  const commissionText = `${t('dashboard.orders.card.commission_prefix')}${formatNumber(order.commission, 2)}`;

  const lineStats = buildLineItems([
    { key: 'pnl', text: pnlText, className: pnlClassName },
    { key: 'commission', text: commissionText }
  ]);

  const originLabel = resolveOrderOriginLabel(order);
  const isFilled = order.status === 'filled';
  const rawTimestamp = isFilled
    ? (order.executedAt ?? order.createdAt ?? null)
    : (order.createdAt ?? null);
  const displayTimestamp = ensureUtc(rawTimestamp);
  const timeLabelKey = isFilled && order.executedAt
    ? 'modals.order_detail.summary.executed_at'
    : 'modals.order_detail.summary.created_at';
  const timeLabel = t(timeLabelKey);

  const relativeLabel = (() => {
    const ts = displayTimestamp ?? null;
    if (!ts) return '—';
    const normalizedIso = normalizeToIsoString(ts);
    if (!normalizedIso) return '—';
    const dt = new Date(normalizedIso);
    const now = new Date();
    const sameDay = now.getFullYear() === dt.getFullYear() && now.getMonth() === dt.getMonth() && now.getDate() === dt.getDate();
    const isEn = i18n.language === 'en';
    
    if (!sameDay) {
      if (isEn) {
        const diffMs = now.getTime() - dt.getTime();
        const diffDays = Math.max(1, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
        return `${diffDays} D`;
      }
      return '1天前';
    }
    
    const diffSec = Math.max(0, Math.floor((now.getTime() - dt.getTime()) / 1000));
    if (diffSec < 60) return isEn ? `${diffSec} s` : `${diffSec}秒前`;
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return isEn ? `${diffMin} m` : `${diffMin}分钟前`;
    const diffHour = Math.floor(diffMin / 60);
    return isEn ? `${diffHour} h` : `${diffHour}小时前`;
  })();

  const timeIntensityClass = (() => {
    const ts = displayTimestamp ?? null;
    if (!ts) return styles.timeVeryLight;
    const normalizedIso = normalizeToIsoString(ts);
    if (!normalizedIso) return styles.timeVeryLight;
    const dt = new Date(normalizedIso);
    const now = new Date();
    const sameDay = now.getFullYear() === dt.getFullYear() && now.getMonth() === dt.getMonth() && now.getDate() === dt.getDate();
    if (!sameDay) return styles.timeVeryLight;
    const diffSec = Math.max(0, Math.floor((now.getTime() - dt.getTime()) / 1000));
    if (diffSec < 60) return styles.timeDeep;
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 15) return styles.timeMedium;
    if (diffMin < 60) return styles.timeLight;
    return styles.timeVeryLight;
  })();

  const actionStatusText = resolveOrderActionStatus(order);

  const getExecutedDayTag = (ts: string | null | undefined): string | null => {
    if (!ts) return null;
    const normalizedIso = normalizeToIsoString(ts);
    if (!normalizedIso) return null;
    const executed = new Date(normalizedIso);
    const now = new Date();
    const startOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const diffDays = Math.floor((startOf(now).getTime() - startOf(executed).getTime()) / 86400000);
    if (diffDays <= 0) return t('dashboard.orders.card.executed_tag.today');
    if (diffDays === 1) return t('dashboard.orders.card.executed_tag.yesterday');
    
    if (i18n.language === 'en' && diffDays >= 2) {
      return executed.toLocaleDateString('en-US', { weekday: 'short' });
    }
    
    if (diffDays === 2) return t('dashboard.orders.card.executed_tag.day_before_yesterday');
    return t('dashboard.orders.card.executed_tag.earlier');
  };

  const executedDayTag = isFilled ? getExecutedDayTag(ensureUtc(order.executedAt ?? order.createdAt)) : null;

  const handleCardClick = () => {
    if (onViewDetail) {
      onViewDetail(order);
    }
  };

  return (
    <div
      className={clsx(cardClass, onViewDetail && styles.cardInteractive)}
      role={onViewDetail ? 'button' : undefined}
      tabIndex={onViewDetail ? 0 : undefined}
      onClick={handleCardClick}
      onKeyDown={(event) => {
        if (!onViewDetail) {
          return;
        }
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onViewDetail(order);
        }
      }}
    >
      <div className={styles.topRow}>
        <div className={styles.symbolGroup}>
          <button
            type="button"
            className={styles.symbolButton}
            onClick={(event) => {
              event.stopPropagation();
              onSelectSymbol?.(symbolLabel);
            }}
          >
            {symbolLabel}
          </button>
          <span className={clsx(styles.statusChip, styles[statusClass])}>{statusLabel}</span>
        </div>
        <div className={styles.actionGroup}>
          <span className={clsx(styles.bottomRight, timeIntensityClass)}>{relativeLabel}</span>
          {isFilled ? (
            <span className={styles.dateTag}>{executedDayTag}</span>
          ) : onCancel ? (
            <button
              type="button"
              className={styles.actionButton}
              onClick={(event) => {
                event.stopPropagation();
                onCancel(order);
              }}
              disabled={!cancellable || Boolean(cancelling)}
            >
              {cancelling ? t('dashboard.orders.card.actions.cancelling') : t('dashboard.orders.card.actions.cancel')}
            </button>
          ) : null}
        </div>
      </div>

      {lineOne.length ? (
        <div className={styles.line}>
          {lineOne.map(({ key, text, className }) => (
            <span key={key} className={clsx(styles.item, className)}>
              {text}
            </span>
          ))}
        </div>
      ) : null}


      {lineStats.length ? (
        <div className={styles.line}>
          {lineStats.map(({ key, text, className }) => (
            <span key={key} className={clsx(styles.item, className)}>
              {text}
            </span>
          ))}
        </div>
      ) : null}

      <div className={styles.line}>
        <span className={clsx(styles.item, styles.metaItem)}>
          {`${timeLabel} ${formatShortDateTime(displayTimestamp, i18n.language)}`}
        </span>
      </div>

      <div className={styles.bottomRow}>
        <span className={clsx(styles.bottomLeft)}>
          {(() => {
            const sp = t('dashboard.orders.card.origin.strategy_prefix');
            const ol = originLabel ?? null;
            if (!ol) return '—';
            const prefix = `${sp}-`;
            if (ol.startsWith(prefix)) {
              const name = ol.slice(prefix.length);
              return (
                <>
                  <span className={styles.originPrefix}>{prefix}</span>
                  <span className={styles.originNameEm}>{name}</span>
                </>
              );
            }
            return <span className={styles.originPurple}>{ol}</span>;
          })()}
        </span>
        <span className={clsx(styles.bottomRight, styles.actionStatus)}>
          {actionStatusText}
        </span>
      </div>
    </div>
  );
}

export default OrderSummaryCard;
