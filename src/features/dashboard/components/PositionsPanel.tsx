import PanelCard, { PanelAction } from './PanelCard';
import { useTranslation } from '@i18n';
import styles from './PositionsPanel.module.css';
import type { PositionItem, SymbolInfo } from '../types';
import { formatPriceWithTick } from '../utils/priceFormatting';

type RequestStatus = 'idle' | 'loading' | 'succeeded' | 'failed';

interface PositionsPanelProps {
  positions: PositionItem[];
  symbols?: SymbolInfo[];
  onSelectSymbol: (symbol: string) => void;
  onConfigureRiskRule: (position: PositionItem) => void;
  onQuickClosePosition?: (symbol: string, position: PositionItem) => void;
  onQuickReversePosition?: (symbol: string, position: PositionItem) => void;
  onRefresh?: () => void;
  quickCloseStatus?: RequestStatus;
  quickCloseError?: string | null;
  quickReverseStatus?: RequestStatus;
  quickReverseError?: string | null;
}

const resolveTickSize = (symbol: string, symbols?: SymbolInfo[]) => {
  if (!symbols?.length) {
    return undefined;
  }
  const normalized = symbol.toUpperCase();
  const direct = symbols.find((item) => item.symbol.toUpperCase() === normalized);
  if (direct?.tickSize) {
    return direct.tickSize;
  }
  const root = normalized.replace(/\d+.*/, '');
  return symbols.find((item) => item.symbol.toUpperCase() === root)?.tickSize ?? undefined;
};

const formatPercent = (value: number | null): string => {
  if (value === null || Number.isNaN(value)) {
    return '—';
  }
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}%`;
};

function PositionsPanel({
  positions,
  symbols,
  onSelectSymbol,
  onConfigureRiskRule,
  onQuickClosePosition,
  onQuickReversePosition,
  onRefresh,
  quickCloseStatus = 'idle',
  quickCloseError,
  quickReverseStatus = 'idle',
  quickReverseError
}: PositionsPanelProps) {
  const { t } = useTranslation();
  const actions: PanelAction[] = [onRefresh ? { label: t('dashboard.positions.actions.refresh'), onClick: onRefresh } : null].filter(Boolean) as PanelAction[];

  const isClosingPosition = quickCloseStatus === 'loading';
  const isReversingPosition = quickReverseStatus === 'loading';
  const quickActionError = quickCloseStatus === 'failed'
    ? quickCloseError
    : quickReverseStatus === 'failed'
      ? quickReverseError
      : null;

  return (
    <PanelCard title={t('dashboard.positions.title')} actions={actions} className={styles.card}>
      {positions.length === 0 ? (
        <div className={styles.emptyState}>{t('dashboard.positions.empty')}</div>
      ) : (
        <div className={styles.cardsList}>
          {positions.map((position, index) => {
            const quantityValue = position.quantity ?? 0;
            const absoluteQuantity = Math.abs(quantityValue);
            const avgPrice = position.avgPrice ?? 0;
            const notional =
              absoluteQuantity && avgPrice
                ? absoluteQuantity * avgPrice * (position.multiplier ?? 1)
                : null;
            const pnlPercent = notional ? (position.pnl / notional) * 100 : null;
            const formattedPnlPercent = formatPercent(pnlPercent);
            const pnlPercentLabel = formattedPnlPercent === '—' ? '—' : `(${formattedPnlPercent})`;

            return (
              <article key={position.id} className={styles.positionCard}>
                <div className={styles.positionHeader}>
                  <button
                    type="button"
                    className={styles.symbolButton}
                    onClick={() => onSelectSymbol(position.symbol)}
                  >
                    {position.symbol}
                  </button>
                  <span
                    className={`${styles.directionTag} ${
                      position.direction === 'long' ? styles.directionLong : styles.directionShort
                    }`}
                  >
                    {position.direction === 'long' ? t('dashboard.positions.direction.long') : t('dashboard.positions.direction.short')}
                  </span>
                </div>
                <div className={styles.positionDetails}>
                  <div className={styles.detailItem}>
                    <span className={styles.detailLabel}>{t('dashboard.positions.labels.quantity')}</span>
                    <span className={styles.detailValue}>{position.quantity.toLocaleString()}</span>
                  </div>
                  <div className={styles.detailItem}>
                    <span className={styles.detailLabel}>{t('dashboard.positions.labels.avg_price')}</span>
                    <span className={styles.detailValue}>
                      {formatPriceWithTick(position.avgPrice, position.symbol, {
                        tickSize: resolveTickSize(position.symbol, symbols),
                        reference: position.markPrice ?? undefined,
                        allowDownscale: true
                      })}
                    </span>
                  </div>
                  <div className={styles.detailItem}>
                    <span className={styles.detailLabel}>{t('dashboard.positions.labels.mark_price')}</span>
                    <span className={styles.detailValue}>
                      {formatPriceWithTick(position.markPrice, position.symbol, {
                        tickSize: resolveTickSize(position.symbol, symbols)
                      })}
                    </span>
                  </div>
                  <div className={`${styles.detailItem} ${styles.pnlItem}`}>
                    <span className={styles.detailLabel}>{t('dashboard.positions.labels.pnl')}</span>
                    <span
                      className={`${styles.detailValue} ${
                        position.pnl >= 0 ? styles.pnlPositive : styles.pnlNegative
                      }`}
                    >
                      <span className={styles.pnlAmount}>{position.pnl.toFixed(2)}</span>
                      <span className={styles.pnlPercent}>{pnlPercentLabel}</span>
                    </span>
                  </div>
                </div>
                <div className={styles.cardFooter}>
                  {(onQuickClosePosition || onQuickReversePosition) && (
                    <div className={styles.quickActions}>
                      {onQuickClosePosition && (
                        <button
                          type="button"
                          className={styles.quickButton}
                          onClick={() => onQuickClosePosition(position.symbol, position)}
                          disabled={isClosingPosition || isReversingPosition}
                        >
                          {isClosingPosition ? t('dashboard.positions.quick.closing') : t('dashboard.positions.quick.close')}
                        </button>
                      )}
                      {onQuickReversePosition && (
                        <button
                          type="button"
                          className={styles.quickButton}
                          onClick={() => onQuickReversePosition(position.symbol, position)}
                          disabled={isClosingPosition || isReversingPosition}
                        >
                          {isReversingPosition ? t('dashboard.positions.quick.reversing') : t('dashboard.positions.quick.reverse')}
                        </button>
                      )}
                    </div>
                  )}
                  {quickActionError && index === 0 ? (
                    <div className={styles.quickError} role="alert">
                      {quickActionError}
                    </div>
                  ) : null}
                  <button
                    type="button"
                    className={styles.riskButton}
                    onClick={() => onConfigureRiskRule(position)}
                  >
                    {t('dashboard.positions.configure_risk')}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </PanelCard>
  );
}

export default PositionsPanel;
