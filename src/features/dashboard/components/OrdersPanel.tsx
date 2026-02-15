import PanelCard from './PanelCard';
import { useTranslation } from '@i18n';
import { useMemo, useState } from 'react';
import styles from './OrdersPanel.module.css';
import OrderSummaryCard from '@components/OrderSummaryCard';
import type { OrderItem } from '../types';

interface OrdersPanelProps {
  orders: OrderItem[];
  onSelectSymbol: (symbol: string) => void;
  onViewDetail: (order: OrderItem) => void;
  onCancel?: (order: OrderItem) => void;
  onRefresh?: () => void;
  onSync?: () => void;
  syncInProgress?: boolean;
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
  onCreateOrder
}: OrdersPanelProps) {
  const { t } = useTranslation();
  const [selectedSymbol, setSelectedSymbol] = useState<string>('__ALL__');
  const [selectedStrategy, setSelectedStrategy] = useState<string>('__ALL__');
  const [scope, setScope] = useState<'active' | 'all'>('active');
  const [actionSelection, setActionSelection] = useState<string>('');
  const actionOptions = useMemo(
    () =>
      [
        { value: 'create', label: t('dashboard.orders.actions.place_order'), onClick: onCreateOrder },
        onSync
          ? {
              value: 'sync',
              label: syncInProgress ? t('dashboard.orders.actions.syncing') : t('dashboard.orders.actions.sync'),
              onClick: syncInProgress ? undefined : onSync,
              disabled: Boolean(syncInProgress)
            }
          : null,
        onRefresh ? { value: 'refresh', label: t('dashboard.orders.actions.refresh'), onClick: onRefresh } : null
      ].filter(Boolean) as Array<{ value: string; label: string; onClick?: () => void; disabled?: boolean }>,
    [onCreateOrder, onRefresh, onSync, syncInProgress, t]
  );


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
      className={styles.card}
      headerMeta={
        <div className={styles.headerControls}>
          <div className={styles.filterGroup}>
            <select
              className={styles.select}
              value={scope}
              onChange={(event) => setScope(event.target.value as 'active' | 'all')}
            >
              <option value="active">{t('dashboard.orders.filter_active')}</option>
              <option value="all">{t('dashboard.orders.filter_all')}</option>
            </select>
            <select
              className={`${styles.select} ${styles.selectWide}`}
              value={selectedSymbol}
              onChange={(event) => handleSelectTag(event.target.value as '__ALL__' | string)}
            >
              <option value="__ALL__">{t('dashboard.orders.filter_all')}</option>
              {symbols.map((sym) => (
                <option key={sym} value={sym}>
                  {sym}
                </option>
              ))}
            </select>
            <select
              className={`${styles.select} ${styles.selectWide}`}
              value={selectedStrategy}
              onChange={(event) => handleSelectStrategyTag(event.target.value as '__ALL__' | string)}
            >
              <option value="__ALL__">{t('dashboard.orders.filter_all')}</option>
              {strategyOptions.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.label}
                </option>
              ))}
            </select>
            <select
              className={`${styles.select} ${styles.actionSelect}`}
              value={actionSelection}
              onChange={(event) => {
                const next = event.target.value;
                setActionSelection(next);
                const action = actionOptions.find((item) => item.value === next);
                if (action && !action.disabled) {
                  action.onClick?.();
                }
                setActionSelection('');
              }}
            >
              <option value="">{t('dashboard.orders.actions.select_action')}</option>
              {actionOptions.map((action) => (
                <option key={action.value} value={action.value} disabled={action.disabled}>
                  {action.label}
                </option>
              ))}
            </select>
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
