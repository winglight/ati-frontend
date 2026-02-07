import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { ORDERS_DEFAULT_PAGE_SIZE } from '@utils/constants';
import type { OrderItem } from '@features/dashboard/types';
import { initializeDashboard } from '@store/thunks/initializeDashboard';
import {
  cancelAllOrders,
  cancelOrderById,
  closePosition,
  fetchOrders,
  reversePosition,
  submitOrder,
  syncOrdersWithBroker
} from '@store/thunks/orders';
import type { FetchOrdersResult } from '@store/thunks/orders';

type RequestStatus = 'idle' | 'loading' | 'succeeded' | 'failed';

interface OrdersFilters {
  status: OrderItem['status'][];
  symbol: string;
  source: string;
  includeDeleted: boolean;
}

interface OrdersState {
  items: OrderItem[];
  status: RequestStatus;
  error?: string;
  total: number;
  page: number;
  pageSize: number;
  hasNext: boolean;
  filters: OrdersFilters;
  lastUpdated?: string;
  cancellingIds: string[];
  bulkCancelStatus: RequestStatus;
  bulkCancelError?: string;
  cancelAllSummary: Record<string, unknown> | null;
  submitStatus: RequestStatus;
  submitError?: string;
  positionCloseStatus: RequestStatus;
  positionCloseError?: string;
  positionReverseStatus: RequestStatus;
  positionReverseError?: string;
  lastCreatedOrderId?: string;
  syncStatus: RequestStatus;
  syncError?: string;
}

const createInitialFilters = (): OrdersFilters => ({
  status: [],
  symbol: '',
  source: '',
  includeDeleted: false
});

const initialState: OrdersState = {
  items: [],
  status: 'idle',
  total: 0,
  page: 1,
  pageSize: ORDERS_DEFAULT_PAGE_SIZE,
  hasNext: false,
  filters: createInitialFilters(),
  cancellingIds: [],
  bulkCancelStatus: 'idle',
  cancelAllSummary: null,
  submitStatus: 'idle',
  positionCloseStatus: 'idle',
  positionReverseStatus: 'idle',
  syncStatus: 'idle'
};

const mergeRawPayload = (
  current: Record<string, unknown> | undefined,
  next: Record<string, unknown> | undefined
): Record<string, unknown> | undefined => {
  if (!current && !next) {
    return undefined;
  }
  if (!next) {
    return current ? { ...current } : undefined;
  }
  return { ...(current ?? {}), ...next };
};

const METRIC_FIELDS: (keyof OrderItem)[] = ['commission', 'pnl', 'realizedPnl', 'unrealizedPnl'];

const METRIC_TOLERANCE = 1e-9;

const mergeOrderFields = (existing: OrderItem, incoming: Partial<OrderItem>): OrderItem => {
  const filtered: Partial<Record<keyof OrderItem, OrderItem[keyof OrderItem]>> = {};
  for (const key of Object.keys(incoming) as (keyof OrderItem)[]) {
    const value = incoming[key];
    if (value === null || value === undefined) {
      continue;
    }

    if (METRIC_FIELDS.includes(key) && typeof value === 'number') {
      const existingValue = existing[key];
      const existingNumber =
        typeof existingValue === 'number' ? existingValue : undefined;

      if (
        Math.abs(value) < METRIC_TOLERANCE &&
        existingNumber !== undefined &&
        Math.abs(existingNumber) >= METRIC_TOLERANCE
      ) {
        continue;
      }
    }

    filtered[key] = value as OrderItem[keyof OrderItem];
  }
  return { ...existing, ...filtered } as OrderItem;
};

const upsertOrderItem = (state: OrdersState, order: OrderItem) => {
  const { raw, ...rest } = order;
  const index = state.items.findIndex((item) => item.id === order.id);
  if (index === -1) {
    state.items.unshift({ ...rest, raw: raw ? { ...raw } : undefined });
    return;
  }
  const existing = state.items[index];
  state.items[index] = {
    ...mergeOrderFields(existing, rest),
    raw: mergeRawPayload(existing.raw, raw)
  };
};

const updateOrderItem = (state: OrdersState, id: string, changes: Partial<OrderItem>) => {
  const index = state.items.findIndex((item) => item.id === id);
  if (index === -1) {
    return;
  }
  const existing = state.items[index];
  const { raw, ...rest } = changes;
  state.items[index] = {
    ...mergeOrderFields(existing, rest),
    raw: mergeRawPayload(existing.raw, raw)
  };
};

const removeOrderItem = (state: OrdersState, id: string) => {
  state.items = state.items.filter((item) => item.id !== id);
};

const removeCancellingId = (state: OrdersState, id: string) => {
  state.cancellingIds = state.cancellingIds.filter((existing) => existing !== id);
};

const ordersSlice = createSlice({
  name: 'orders',
  initialState,
  reducers: {
    upsertOrder(state, action: PayloadAction<OrderItem>) {
      upsertOrderItem(state, action.payload);
    },
    updateOrder(state, action: PayloadAction<{ id: string; changes: Partial<OrderItem> }>) {
      updateOrderItem(state, action.payload.id, action.payload.changes);
    },
    removeOrder(state, action: PayloadAction<string>) {
      removeOrderItem(state, action.payload);
    },
    setOrdersSnapshot(state, action: PayloadAction<FetchOrdersResult>) {
      const { items, total, page, pageSize, hasNext, receivedAt } = action.payload;

      // 如果推送过来的订单列表为空，但本地已有数据，则保留本地数据（避免实时推送覆盖历史分页数据）
      if (items.length === 0 && state.items.length > 0) {
        if (receivedAt) {
          state.lastUpdated = receivedAt;
        }
        return;
      }

      state.items = items;
      state.total = total;
      state.page = page;
      state.pageSize = pageSize;
      state.hasNext = hasNext;
      state.lastUpdated = receivedAt;
      state.status = 'succeeded';
      state.error = undefined;
    },
    setStatusFilter(state, action: PayloadAction<OrderItem['status'][]>) {
      state.filters.status = action.payload;
      state.page = 1;
    },
    setSymbolFilter(state, action: PayloadAction<string>) {
      state.filters.symbol = action.payload;
      state.page = 1;
    },
    setSourceFilter(state, action: PayloadAction<string>) {
      state.filters.source = action.payload;
      state.page = 1;
    },
    setIncludeDeleted(state, action: PayloadAction<boolean>) {
      state.filters.includeDeleted = action.payload;
      state.page = 1;
    },
    setPage(state, action: PayloadAction<number>) {
      state.page = action.payload;
    },
    setPageSize(state, action: PayloadAction<number>) {
      state.pageSize = action.payload;
      state.page = 1;
    },
    resetFilters(state) {
      state.filters = createInitialFilters();
      state.page = 1;
    },
    clearOrdersError(state) {
      state.error = undefined;
    },
    resetOrderCreation(state) {
      state.submitStatus = 'idle';
      state.submitError = undefined;
      state.lastCreatedOrderId = undefined;
    }
  },
  extraReducers: (builder) => {
    builder
      .addCase(initializeDashboard.pending, (state) => {
        state.status = 'loading';
        state.error = undefined;
        state.cancellingIds = [];
        state.bulkCancelStatus = 'idle';
        state.bulkCancelError = undefined;
      })
      .addCase(initializeDashboard.fulfilled, (state, action) => {
        state.status = 'succeeded';
        state.error = undefined;
        state.items = action.payload.snapshot.orders;
        state.total = action.payload.snapshot.orders.length;
        state.page = 1;
        state.hasNext = action.payload.snapshot.orders.length >= state.pageSize;
        state.lastUpdated = new Date().toISOString();
      })
      .addCase(initializeDashboard.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.error.message;
      })
      .addCase(fetchOrders.pending, (state) => {
        state.status = 'loading';
        state.error = undefined;
      })
      .addCase(fetchOrders.fulfilled, (state, action) => {
        state.status = 'succeeded';
        state.items = action.payload.items;
        state.total = action.payload.total;
        state.page = action.payload.page;
        state.pageSize = action.payload.pageSize;
        state.hasNext = action.payload.hasNext;
        state.lastUpdated = action.payload.receivedAt;
      })
      .addCase(fetchOrders.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.error.message ?? '订单列表加载失败';
      })
      .addCase(syncOrdersWithBroker.pending, (state) => {
        state.syncStatus = 'loading';
        state.syncError = undefined;
      })
      .addCase(syncOrdersWithBroker.fulfilled, (state, action) => {
        state.syncStatus = 'succeeded';
        state.syncError = undefined;
        for (const order of action.payload.updated) {
          upsertOrderItem(state, order);
        }
        state.lastUpdated = action.payload.receivedAt;
      })
      .addCase(syncOrdersWithBroker.rejected, (state, action) => {
        state.syncStatus = 'failed';
        state.syncError = action.error.message ?? '同步订单失败';
      })
      .addCase(cancelOrderById.pending, (state, action) => {
        if (!state.cancellingIds.includes(action.meta.arg.id)) {
          state.cancellingIds.push(action.meta.arg.id);
        }
        state.error = undefined;
      })
      .addCase(cancelOrderById.fulfilled, (state, action) => {
        removeCancellingId(state, action.meta.arg.id);
        upsertOrderItem(state, action.payload);
      })
      .addCase(cancelOrderById.rejected, (state, action) => {
        removeCancellingId(state, action.meta.arg.id);
        state.error = action.error.message ?? '撤单请求失败';
      })
      .addCase(cancelAllOrders.pending, (state) => {
        state.bulkCancelStatus = 'loading';
        state.bulkCancelError = undefined;
      })
      .addCase(cancelAllOrders.fulfilled, (state, action) => {
        state.bulkCancelStatus = 'succeeded';
        state.cancelAllSummary = action.payload ?? null;
      })
      .addCase(cancelAllOrders.rejected, (state, action) => {
        state.bulkCancelStatus = 'failed';
        state.bulkCancelError = action.error.message ?? '批量撤单失败';
      })
      .addCase(submitOrder.pending, (state) => {
        state.submitStatus = 'loading';
        state.submitError = undefined;
      })
      .addCase(submitOrder.fulfilled, (state, action) => {
        state.submitStatus = 'succeeded';
        state.submitError = undefined;
        state.lastCreatedOrderId = action.payload.id;
        upsertOrderItem(state, action.payload);
      })
      .addCase(submitOrder.rejected, (state, action) => {
        state.submitStatus = 'failed';
        state.submitError = action.error.message ?? '下单请求失败';
      })
      .addCase(closePosition.pending, (state) => {
        state.positionCloseStatus = 'loading';
        state.positionCloseError = undefined;
      })
      .addCase(closePosition.fulfilled, (state, action) => {
        state.positionCloseStatus = 'succeeded';
        state.positionCloseError = undefined;
        state.lastCreatedOrderId = action.payload.id;
        upsertOrderItem(state, action.payload);
      })
      .addCase(closePosition.rejected, (state, action) => {
        state.positionCloseStatus = 'failed';
        state.positionCloseError = action.error.message ?? '平仓请求失败';
      })
      .addCase(reversePosition.pending, (state) => {
        state.positionReverseStatus = 'loading';
        state.positionReverseError = undefined;
      })
      .addCase(reversePosition.fulfilled, (state, action) => {
        state.positionReverseStatus = 'succeeded';
        state.positionReverseError = undefined;
        state.lastCreatedOrderId = action.payload.id;
        upsertOrderItem(state, action.payload);
      })
      .addCase(reversePosition.rejected, (state, action) => {
        state.positionReverseStatus = 'failed';
        state.positionReverseError = action.error.message ?? '反向下单失败';
      });
  }
});

export const {
  upsertOrder,
  updateOrder,
  removeOrder,
  setOrdersSnapshot,
  setStatusFilter,
  setSymbolFilter,
  setSourceFilter,
  setIncludeDeleted,
  setPage,
  setPageSize,
  resetFilters,
  clearOrdersError,
  resetOrderCreation
} = ordersSlice.actions;

export default ordersSlice.reducer;
