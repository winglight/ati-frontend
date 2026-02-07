import { createAsyncThunk } from '@reduxjs/toolkit';
import type { OrderItem } from '@features/dashboard/types';
import type { RootState } from '@store/index';
import {
  OrdersApiError,
  listOrders,
  cancelOrder as cancelOrderRequest,
  cancelAllOrders as cancelAllOrdersRequest,
  createOrder as createOrderRequest,
  syncOrders as syncOrdersRequest,
  closePosition as closePositionRequest,
  reversePosition as reversePositionRequest,
  type OrderListResult,
  type CancelAllOrdersResponse,
  type CreateOrderRequest,
  type SyncOrdersResult
} from '@services/ordersApi';
import { addToast } from '@store/slices/toastSlice';
import { ORDERS_DEFAULT_PAGE_SIZE } from '@utils/constants';

const requireToken = (state: RootState): string => {
  const token = state.auth.token;
  if (!token) {
    throw new Error('当前会话未认证，请重新登录后再试。');
  }
  return token;
};

export interface FetchOrdersArgs {
  page?: number;
  pageSize?: number;
}

export interface FetchOrdersResult extends OrderListResult {
  receivedAt: string;
  page: number;
  pageSize: number;
}

export interface CreateOrderArgs extends CreateOrderRequest {}

export interface ClosePositionArgs {
  symbol: string;
}

export interface ReversePositionArgs {
  symbol: string;
}

export const fetchOrders = createAsyncThunk<FetchOrdersResult, FetchOrdersArgs | undefined, { state: RootState }>(
  'orders/fetchOrders',
  async (args, thunkAPI) => {
    const state = thunkAPI.getState();
    const token = requireToken(state);
    const ordersState = state.orders;

    const page = args?.page ?? ordersState.page ?? 1;
    const pageSize = args?.pageSize ?? ordersState.pageSize ?? ORDERS_DEFAULT_PAGE_SIZE;

    try {
      const response = await listOrders(token, {
        page,
        pageSize,
        status: ordersState.filters.status.length ? ordersState.filters.status : undefined,
        symbol: ordersState.filters.symbol.trim() ? ordersState.filters.symbol.trim() : undefined,
        source: ordersState.filters.source.trim() ? ordersState.filters.source.trim() : undefined,
        includeDeleted: ordersState.filters.includeDeleted
      });

      return {
        ...response,
        page,
        pageSize,
        receivedAt: new Date().toISOString()
      };
    } catch (error) {
      if (error instanceof OrdersApiError) {
        throw new Error(error.message);
      }
      throw error;
    }
  }
);

export interface CancelOrderArgs {
  id: string;
  ibOrderId?: string | null;
  clientOrderId?: string | null;
  reason?: string;
}

export const cancelOrderById = createAsyncThunk<OrderItem, CancelOrderArgs, { state: RootState }>(
  'orders/cancelOrderById',
  async ({ id, ibOrderId, clientOrderId, reason }: CancelOrderArgs, thunkAPI) => {
    const state = thunkAPI.getState();
    const token = requireToken(state);

    try {
      const record = await cancelOrderRequest(token, id, {
        reason,
        ibOrderId: ibOrderId ?? null,
        clientOrderId: clientOrderId ?? null
      });
      thunkAPI.dispatch(addToast({ message: '撤单请求已提交', variant: 'success' }));
      return record;
    } catch (error) {
      if (error instanceof OrdersApiError) {
        thunkAPI.dispatch(addToast({ message: `撤单失败：${error.message}`, variant: 'error' }));
        throw new Error(error.message);
      }
      thunkAPI.dispatch(addToast({ message: '撤单失败', variant: 'error' }));
      throw error;
    }
  }
);

export const cancelAllOrders = createAsyncThunk<CancelAllOrdersResponse, string | undefined, { state: RootState }>(
  'orders/cancelAllOrders',
  async (reason, thunkAPI) => {
    const state = thunkAPI.getState();
    const token = requireToken(state);

    try {
      const result: CancelAllOrdersResponse = await cancelAllOrdersRequest(token, reason ? { reason } : {});
      thunkAPI.dispatch(addToast({ message: '批量撤单请求已提交', variant: 'success' }));
      return result;
    } catch (error) {
      if (error instanceof OrdersApiError) {
        thunkAPI.dispatch(addToast({ message: `批量撤单失败：${error.message}`, variant: 'error' }));
        throw new Error(error.message);
      }
      thunkAPI.dispatch(addToast({ message: '批量撤单失败', variant: 'error' }));
      throw error;
    }
  }
);

export const syncOrdersWithBroker = createAsyncThunk<SyncOrdersResult, void, { state: RootState }>(
  'orders/syncWithBroker',
  async (_arg, thunkAPI) => {
    const state = thunkAPI.getState();
    const token = requireToken(state);

    try {
      const result = await syncOrdersRequest(token);
      const message = result.updated.length
        ? `已同步 ${result.updated.length} 条订单状态`
        : '订单状态已同步';
      thunkAPI.dispatch(addToast({ message, variant: 'success' }));
      return result;
    } catch (error) {
      if (error instanceof OrdersApiError) {
        thunkAPI.dispatch(addToast({ message: `同步订单失败：${error.message}`, variant: 'error' }));
        throw new Error(error.message);
      }
      thunkAPI.dispatch(addToast({ message: '同步订单失败', variant: 'error' }));
      throw error;
    }
  }
);

export const submitOrder = createAsyncThunk<OrderItem, CreateOrderArgs, { state: RootState }>(
  'orders/submitOrder',
  async (payload, thunkAPI) => {
    const state = thunkAPI.getState();
    const token = requireToken(state);

    try {
      const result = await createOrderRequest(token, payload);
      thunkAPI.dispatch(addToast({ message: '下单请求已提交', variant: 'success' }));
      return result;
    } catch (error) {
      if (error instanceof OrdersApiError) {
        thunkAPI.dispatch(addToast({ message: `下单失败：${error.message}`, variant: 'error' }));
        throw new Error(error.message);
      }
      thunkAPI.dispatch(addToast({ message: '下单失败', variant: 'error' }));
      throw error;
    }
  }
);

export const closePosition = createAsyncThunk<OrderItem, ClosePositionArgs, { state: RootState }>(
  'orders/closePosition',
  async ({ symbol }: ClosePositionArgs, thunkAPI) => {
    const state = thunkAPI.getState();
    const token = requireToken(state);

    try {
      const result = await closePositionRequest(token, symbol);
      thunkAPI.dispatch(addToast({ message: `平仓指令已提交 (${symbol})`, variant: 'success' }));
      return result;
    } catch (error) {
      if (error instanceof OrdersApiError) {
        thunkAPI.dispatch(addToast({ message: `平仓失败：${error.message}`, variant: 'error' }));
        throw new Error(error.message);
      }
      thunkAPI.dispatch(addToast({ message: '平仓失败', variant: 'error' }));
      throw error;
    }
  }
);

export const reversePosition = createAsyncThunk<OrderItem, ReversePositionArgs, { state: RootState }>(
  'orders/reversePosition',
  async ({ symbol }: ReversePositionArgs, thunkAPI) => {
    const state = thunkAPI.getState();
    const token = requireToken(state);

    try {
      const result = await reversePositionRequest(token, symbol);
      thunkAPI.dispatch(addToast({ message: `反手指令已提交 (${symbol})`, variant: 'success' }));
      return result;
    } catch (error) {
      if (error instanceof OrdersApiError) {
        thunkAPI.dispatch(addToast({ message: `反手失败：${error.message}`, variant: 'error' }));
        throw new Error(error.message);
      }
      thunkAPI.dispatch(addToast({ message: '反手失败', variant: 'error' }));
      throw error;
    }
  }
);
