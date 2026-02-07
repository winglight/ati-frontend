import { type ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import i18n from '@i18n';
import type { OrderItem } from '@features/dashboard/types';
import OrderDetailModal from '@components/modals/OrderDetailModal';
import OrderEntryModal from '@components/modals/OrderEntryModal';
import OrderSummaryCard from '@components/OrderSummaryCard';
import PageHeader from './components/PageHeader';
import layoutStyles from './PageLayout.module.css';
import styles from './OrdersPage.module.css';
import { useAppDispatch, useAppSelector } from '@store/hooks';
import { cancelAllOrders, cancelOrderById, fetchOrders, submitOrder } from '@store/thunks/orders';
import {
  resetFilters,
  setIncludeDeleted,
  setPage,
  setPageSize,
  setSourceFilter,
  setStatusFilter,
  setSymbolFilter,
  resetOrderCreation
} from '@store/slices/ordersSlice';
import type { CreateOrderArgs } from '@store/thunks/orders';
import useOrdersRealtime from '../hooks/useOrdersRealtime';

const getLocale = (): string => (i18n.language === 'zh' ? 'zh-CN' : 'en-US');
const statusValues: Array<{ value: 'all' | OrderItem['status'] }> = [
  { value: 'all' },
  { value: 'working' },
  { value: 'pending' },
  { value: 'filled' },
  { value: 'cancelled' },
  { value: 'rejected' },
  { value: 'inactive' }
];

const formatTimestamp = (value: string | undefined): string => {
  if (!value) {
    return '—';
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  const locale = getLocale();
  return `${parsed.toLocaleDateString(locale)} ${parsed.toLocaleTimeString(locale)}`;
};

function OrdersPage() {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const ordersState = useAppSelector((state) => state.orders);
  const symbols = useAppSelector((state) => state.market.symbols);
  const selectedSymbol = useAppSelector((state) => state.market.selectedSymbol);
  const [symbolInput, setSymbolInput] = useState(ordersState.filters.symbol);
  const [sourceInput, setSourceInput] = useState(ordersState.filters.source);
  const [orderEntryOpen, setOrderEntryOpen] = useState(false);
  const [orderEntrySymbol, setOrderEntrySymbol] = useState('');
  const [inspectedOrder, setInspectedOrder] = useState<OrderItem | null>(null);
  const orderEntrySubmissionRef = useRef(false);

  const ordersReady = ordersState.status === 'succeeded' || ordersState.status === 'loading';

  useOrdersRealtime({ enabled: ordersReady });

  useEffect(() => {
    if (ordersState.status === 'idle') {
      void dispatch(fetchOrders());
    }
  }, [dispatch, ordersState.status]);

  useEffect(() => {
    setSymbolInput(ordersState.filters.symbol);
  }, [ordersState.filters.symbol]);

  useEffect(() => {
    setSourceInput(ordersState.filters.source);
  }, [ordersState.filters.source]);

  useEffect(() => {
    if (!orderEntryOpen || !orderEntrySubmissionRef.current) {
      return;
    }
    if (ordersState.submitStatus === 'succeeded') {
      setOrderEntryOpen(false);
      setOrderEntrySymbol('');
      orderEntrySubmissionRef.current = false;
      dispatch(resetOrderCreation());
    } else if (ordersState.submitStatus === 'failed') {
      orderEntrySubmissionRef.current = false;
    }
  }, [dispatch, orderEntryOpen, ordersState.submitStatus]);

  const totalPages = useMemo(() => {
    if (ordersState.pageSize <= 0) {
      return 1;
    }
    const computed = Math.ceil(ordersState.total / ordersState.pageSize);
    if (computed > 0) {
      return computed;
    }
    return ordersState.hasNext ? ordersState.page + 1 : Math.max(ordersState.page, 1);
  }, [ordersState.total, ordersState.pageSize, ordersState.hasNext, ordersState.page]);

  const handleRefresh = useCallback(() => {
    void dispatch(fetchOrders({ page: ordersState.page }));
  }, [dispatch, ordersState.page]);

  const handleStatusChange = useCallback(
    (event: ChangeEvent<HTMLSelectElement>) => {
      const nextValue = event.target.value as 'all' | OrderItem['status'];
      dispatch(setStatusFilter(nextValue === 'all' ? [] : [nextValue]));
      void dispatch(fetchOrders({ page: 1 }));
    },
    [dispatch]
  );

  const handleApplyFilters = useCallback(() => {
    dispatch(setSymbolFilter(symbolInput.trim()));
    dispatch(setSourceFilter(sourceInput.trim()));
    void dispatch(fetchOrders({ page: 1 }));
  }, [dispatch, symbolInput, sourceInput]);

  const handleResetFilters = useCallback(() => {
    dispatch(resetFilters());
    setSymbolInput('');
    setSourceInput('');
    void dispatch(fetchOrders({ page: 1 }));
  }, [dispatch]);

  const handleSelectSymbolFilter = useCallback(
    (symbol: string) => {
      const trimmed = symbol.trim();
      setSymbolInput(trimmed);
      dispatch(setSymbolFilter(trimmed));
      void dispatch(fetchOrders({ page: 1 }));
    },
    [dispatch]
  );

  const handleIncludeDeletedChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      dispatch(setIncludeDeleted(event.target.checked));
      void dispatch(fetchOrders({ page: 1 }));
    },
    [dispatch]
  );

  const handlePageChange = useCallback(
    (nextPage: number) => {
      if (nextPage < 1) {
        return;
      }
      dispatch(setPage(nextPage));
      void dispatch(fetchOrders({ page: nextPage }));
    },
    [dispatch]
  );

  const handlePageSizeChange = useCallback(
    (event: ChangeEvent<HTMLSelectElement>) => {
      const nextSize = Number(event.target.value);
      if (!Number.isFinite(nextSize) || nextSize <= 0) {
        return;
      }
      dispatch(setPageSize(nextSize));
      void dispatch(fetchOrders({ page: 1, pageSize: nextSize }));
    },
    [dispatch]
  );

  const handleCancelOrder = useCallback(
    (order: OrderItem) => {
      void dispatch(
        cancelOrderById({
          id: order.id,
          ibOrderId: order.ibOrderId ?? null,
          clientOrderId: order.clientOrderId ?? null
        })
      );
    },
    [dispatch]
  );

  const handleViewOrderDetail = useCallback(
    (order: OrderItem) => {
      setInspectedOrder(order);
    },
    []
  );

  const handleCancelAll = useCallback(() => {
    dispatch(cancelAllOrders(undefined))
      .unwrap()
      .catch(() => {
        // error state handled via slice
      });
  }, [dispatch]);

  const handleOpenOrderEntry = useCallback(() => {
    dispatch(resetOrderCreation());
    const fallbackSymbol = selectedSymbol ?? symbols[0]?.symbol ?? '';
    setOrderEntrySymbol(fallbackSymbol);
    setOrderEntryOpen(true);
  }, [dispatch, selectedSymbol, symbols]);

  const handleCloseOrderEntry = useCallback(() => {
    setOrderEntryOpen(false);
    setOrderEntrySymbol('');
    orderEntrySubmissionRef.current = false;
    dispatch(resetOrderCreation());
  }, [dispatch]);

  const handleSubmitOrder = useCallback(
    (payload: CreateOrderArgs) => {
      orderEntrySubmissionRef.current = true;
      void dispatch(submitOrder(payload));
    },
    [dispatch]
  );

  const appliedStatus = ordersState.filters.status.length ? ordersState.filters.status[0] : 'all';
  const isLoading = ordersState.status === 'loading';
  const orderCreationError = ordersState.submitError ?? null;

  return (
    <div className={layoutStyles.page}>
      <PageHeader
        title={t('orders.page.title')}
        description={t('orders.page.description')}
        actions={[
          {
            label: t('orders.actions.new_order'),
            variant: 'primary',
            onClick: handleOpenOrderEntry
          },
          {
            label: t('orders.actions.refresh'),
            variant: 'outline',
            onClick: handleRefresh,
            disabled: isLoading
          },
          {
            label: ordersState.bulkCancelStatus === 'loading' ? t('orders.actions.bulk_cancelling') : t('orders.actions.bulk_cancel'),
            variant: 'primary',
            onClick: handleCancelAll,
            disabled: isLoading || ordersState.bulkCancelStatus === 'loading'
          }
        ]}
      />

      <div className={styles.pageContent}>
        <div className={styles.toolbar}>
          <div className={styles.filters}>
            <div className={styles.filterField}>
              <label className={styles.filterLabel} htmlFor="statusFilter">
                {t('orders.filters.status')}
              </label>
              <select
                id="statusFilter"
                className={styles.select}
                value={appliedStatus}
                onChange={handleStatusChange}
                disabled={isLoading}
              >
                {statusValues.map((option) => (
                  <option key={option.value} value={option.value}>
                    {t(`orders.status.${option.value}`)}
                  </option>
                ))}
              </select>
            </div>

            <div className={styles.filterField}>
              <label className={styles.filterLabel} htmlFor="symbolFilter">
                {t('orders.filters.symbol')}
              </label>
              <input
                id="symbolFilter"
                className={styles.input}
                value={symbolInput}
                placeholder={t('orders.filters.symbol_placeholder')}
                onChange={(event) => setSymbolInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    handleApplyFilters();
                  }
                }}
              />
            </div>

            <div className={styles.filterField}>
              <label className={styles.filterLabel} htmlFor="sourceFilter">
                {t('orders.filters.source')}
              </label>
              <input
                id="sourceFilter"
                className={styles.input}
                value={sourceInput}
                placeholder={t('orders.filters.source_placeholder')}
                onChange={(event) => setSourceInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    handleApplyFilters();
                  }
                }}
              />
            </div>

            <label className={styles.checkboxRow} htmlFor="includeDeleted">
              <input
                id="includeDeleted"
                type="checkbox"
                checked={ordersState.filters.includeDeleted}
                onChange={handleIncludeDeletedChange}
                disabled={isLoading}
              />
              {t('orders.filters.include_deleted')}
            </label>

            <button
              type="button"
              className={`${styles.button} ${styles.ghostButton}`}
              onClick={handleApplyFilters}
              disabled={isLoading}
            >
              {t('orders.filters.apply')}
            </button>
            <button
              type="button"
              className={`${styles.button} ${styles.ghostButton}`}
              onClick={handleResetFilters}
              disabled={isLoading}
            >
              {t('orders.filters.reset')}
            </button>
          </div>
          <div className={styles.metaGroup}>
            <span className={styles.metaItem}>{t('orders.meta.total_prefix')} {ordersState.total}</span>
            {ordersState.lastUpdated ? (
              <span className={styles.metaItem}>{t('orders.meta.last_sync_prefix')} {formatTimestamp(ordersState.lastUpdated)}</span>
            ) : null}
          </div>
        </div>

        {ordersState.error ? <div className={styles.errorBanner}>{ordersState.error}</div> : null}
        {ordersState.bulkCancelStatus === 'failed' && ordersState.bulkCancelError ? (
          <div className={styles.errorBanner}>{ordersState.bulkCancelError}</div>
        ) : null}
        {orderCreationError ? <div className={styles.errorBanner}>{orderCreationError}</div> : null}

        <div className={styles.cardsContainer}>
          {isLoading && ordersState.items.length === 0 ? (
            <div className={styles.emptyCell}>{t('orders.empty.loading')}</div>
          ) : null}
          {!isLoading && ordersState.items.length === 0 ? (
            <div className={styles.emptyCell}>{t('orders.empty.no_records')}</div>
          ) : null}
          {ordersState.items.length > 0 ? (
            <div className={styles.cardsScroll}>
              <div className={styles.cardList}>
                {ordersState.items.map((order) => (
                  <OrderSummaryCard
                    key={order.id}
                    order={order}
                    onSelectSymbol={handleSelectSymbolFilter}
                    onViewDetail={handleViewOrderDetail}
                    onCancel={handleCancelOrder}
                    cancelling={ordersState.cancellingIds.includes(order.id)}
                  />
                ))}
              </div>
            </div>
          ) : null}
        </div>

        <div className={styles.pagination}>
          <div className={styles.paginationInfo}>{t('orders.pagination.info', { page: ordersState.page, total: totalPages })}</div>
          <div className={styles.paginationControls}>
            <button
              type="button"
              className={`${styles.button} ${styles.ghostButton}`}
              onClick={() => handlePageChange(ordersState.page - 1)}
              disabled={ordersState.page <= 1 || isLoading}
            >
              {t('orders.pagination.prev')}
            </button>
            <button
              type="button"
              className={`${styles.button} ${styles.ghostButton}`}
              onClick={() => handlePageChange(ordersState.page + 1)}
              disabled={!ordersState.hasNext || isLoading}
            >
              {t('orders.pagination.next')}
            </button>
            <select
              className={styles.select}
              value={ordersState.pageSize}
              onChange={handlePageSizeChange}
              disabled={isLoading}
            >
              {[10, 25, 50, 100].map((size) => (
                <option key={size} value={size}>
                  {t('orders.pagination.per_page', { size })}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>
      <OrderEntryModal
        open={orderEntryOpen}
        symbols={symbols}
        defaultSymbol={orderEntrySymbol || selectedSymbol || symbols[0]?.symbol}
        submitting={ordersState.submitStatus === 'loading'}
        error={orderCreationError}
        onSubmit={handleSubmitOrder}
        onClose={handleCloseOrderEntry}
      />
      <OrderDetailModal
        open={Boolean(inspectedOrder)}
        order={inspectedOrder}
        onClose={() => setInspectedOrder(null)}
      />
    </div>
  );
}

export default OrdersPage;
