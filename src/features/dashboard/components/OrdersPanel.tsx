import PanelCard, { PanelAction } from './PanelCard';
import { useTranslation } from '@i18n';
import { useMemo, useState } from 'react';
import styles from './OrdersPanel.module.css';
import OrderSummaryCard from '@components/OrderSummaryCard';
import type { OrderItem } from '../types';
import { formatLocalDateTime } from '../../../utils/dateTime';

interface OrdersPanelProps {
  orders: OrderItem[];
  onSelectSymbol: (symbol: string) => void;
  onViewDetail: (order: OrderItem) => void;
  onCancel?: (order: OrderItem) => void;
  onRefresh?: () => void;
  onSync?: () => void;
  syncInProgress?: boolean;
  lastUpdated?: string;
  onCreateOrder: () => void;
}

function OrdersPanel({
  orders,
  onSelectSymbol,
  onViewDetail,
  onCancel,
  onRefresh,
  onSync,
  syncInProgress,
  lastUpdated,
  onCreateOrder
}: OrdersPanelProps) {
  const { t, i18n } = useTranslation();
  const [selectedSymbol, setSelectedSymbol] = useState<string>('__ALL__');
  const [selectedStrategy, setSelectedStrategy] = useState<string>('__ALL__');
  const [scope, setScope] = useState<'active' | 'all'>('active');
  const actions: PanelAction[] = [
    { label: t('dashboard.orders.actions.place_order'), onClick: onCreateOrder, variant: 'primary' },
    onSync
      ? {
          label: syncInProgress ? t('dashboard.orders.actions.syncing') : t('dashboard.orders.actions.sync'),
          onClick: syncInProgress ? undefined : onSync,
          disabled: Boolean(syncInProgress)
        }
      : null,
    onRefresh ? { label: t('dashboard.orders.actions.refresh'), onClick: onRefresh } : null
  ].filter(Boolean) as PanelAction[];

  const formattedUpdated = lastUpdated
    ? formatLocalDateTime(lastUpdated, i18n.language)
    : '—';

  const symbols = useMemo(() => {
    const uniq = Array.from(new Set(orders.map((o) => o.symbol)));
    return uniq.sort((a, b) => a.localeCompare(b));
  }, [orders]);

  const strategyOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const o of orders) {
      const id = o.strategy ?? o.strategyName ?? null;
      if (!id) continue;
      const label = o.strategyName ?? o.strategy ?? id;
      if (!map.has(id)) {
        map.set(id, label);
      }
    }
    return Array.from(map.entries())
      .map(([id, label]) => ({ id, label }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [orders]);

  const visibleOrders = useMemo(() => {
    const bySymbol = selectedSymbol === '__ALL__'
      ? orders
      : orders.filter((o) => o.symbol === selectedSymbol);

    const filtered = selectedStrategy === '__ALL__'
      ? bySymbol
      : bySymbol.filter((o) => o.strategy === selectedStrategy || o.strategyName === selectedStrategy);

    const scoped = scope === 'active'
      ? filtered.filter((o) => o.status !== 'cancelled' && o.status !== 'inactive' && o.status !== 'rejected')
      : filtered;

    const parseOrderTime = (o: OrderItem): number => {
      const candidates = [o.executedAt ?? null, o.createdAt ?? null];
      for (const ts of candidates) {
        if (!ts) continue;
        const t = Date.parse(ts);
        if (!Number.isNaN(t)) {
          return t;
        }
      }
      return 0;
    };

    return scoped.slice().sort((a, b) => parseOrderTime(b) - parseOrderTime(a));
  }, [orders, selectedSymbol, selectedStrategy, scope]);

  const handleSelectTag = (symbol: string | '__ALL__') => {
    setSelectedSymbol(symbol);
    if (symbol !== '__ALL__') {
      onSelectSymbol(symbol);
    }
  };

  const handleSelectStrategyTag = (strategy: string | '__ALL__') => {
    setSelectedStrategy(strategy);
  };

  return (
    <PanelCard
      title={t('dashboard.orders.title')}
      subtitle={<span className={styles.count}>{visibleOrders.length}</span>}
      actions={actions}
      className={styles.card}
      headerMeta={
        <div className={styles.headerControls}>
          <span className={styles.lastSync}>{t('dashboard.orders.last_sync_prefix')}{formattedUpdated}</span>
          <div className={styles.assetTags}>
            <button
              type="button"
              className={`${styles.tag} ${styles.tagSelected}`}
              onClick={() => setScope(scope === 'active' ? 'all' : 'active')}
            >
              {scope === 'active' ? t('dashboard.orders.filter_active') : t('dashboard.orders.filter_all')}
            </button>
          </div>
          <div className={styles.assetTags}>
            <button
              type="button"
              className={`${styles.tag} ${selectedSymbol === '__ALL__' ? styles.tagSelected : ''}`}
              onClick={() => handleSelectTag('__ALL__')}
            >
              {t('dashboard.orders.filter_all')}
            </button>
            {symbols.map((sym) => (
              <button
                key={sym}
                type="button"
                className={`${styles.tag} ${selectedSymbol === sym ? styles.tagSelected : ''}`}
                onClick={() => handleSelectTag(sym)}
              >
                {sym}
              </button>
            ))}
          </div>
          <div className={styles.assetTags}>
            <button
              type="button"
              className={`${styles.tag} ${selectedStrategy === '__ALL__' ? styles.tagSelected : ''}`}
              onClick={() => handleSelectStrategyTag('__ALL__')}
            >
              {t('dashboard.orders.filter_all')}
            </button>
            {strategyOptions.map((opt) => (
              <button
                key={opt.id}
                type="button"
                className={`${styles.tag} ${selectedStrategy === opt.id ? styles.tagSelected : ''}`}
                onClick={() => handleSelectStrategyTag(opt.id)}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      }
    >
      {visibleOrders.length === 0 ? (
        <div className={styles.empty}>{t('dashboard.orders.empty')}</div>
      ) : (
        <div className={styles.scrollArea}>
          <div className={styles.grid}>
            {visibleOrders.map((order) => (
              <OrderSummaryCard
                key={order.id}
                order={order}
                onSelectSymbol={onSelectSymbol}
                onViewDetail={onViewDetail}
                onCancel={onCancel}
              />
            ))}
          </div>
        </div>
      )}
    </PanelCard>
  );
}

export default OrdersPanel;
