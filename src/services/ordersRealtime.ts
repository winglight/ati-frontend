import type { AppDispatch, RootState } from '@store/index';
import { setConnectionStatus, setHeartbeat } from '@store/slices/realtimeSlice';
import { logout } from '@store/slices/authSlice';
import { setOrdersSnapshot, upsertOrder, updateOrder } from '@store/slices/ordersSlice';
import { fetchOrders } from '@store/thunks/orders';
import type { FetchOrdersResult } from '@store/thunks/orders';
import {
  mapOrderEventToChanges,
  mapOrderRecord,
  type OrderEventPayload,
  type OrderRecordPayload
} from './ordersApi';
import { refreshAccountPositions, refreshAccountSummary } from '@store/thunks/account';
import { loadStrategies } from '@store/thunks/strategies';
import {
  isAuthenticationFailureCloseEvent,
  subscribeWebSocket,
  type WebSocketSubscription
} from './websocketHub';
import { pushNotification } from '@store/slices/notificationsSlice';
import type { NotificationItem } from '@features/dashboard/types';

interface OrdersRealtimeClientOptions {
  dispatch: AppDispatch;
  tokenProvider: () => string | null;
  stateProvider?: () => RootState;
  pollIntervalMs?: number;
  refreshDebounceMs?: number;
}

interface WebSocketEnvelope {
  type?: string;
  event?: string;
  payload?: unknown;
  timestamp?: string;
  action?: string;
  topics?: string[];
}

const DEFAULT_POLL_INTERVAL = 15000;
const DEFAULT_REFRESH_DEBOUNCE = 1200;

const ORDER_STATUS_EVENTS = new Set(['filled', 'cancelled', 'canceled', 'apicancelled', 'rejected', 'inactive']);

const parseOrdersSnapshot = (
  payload: unknown,
  fallbackTimestamp?: string
): FetchOrdersResult | null => {
  if (!payload || typeof payload !== 'object') {
    return null;
  }
  const record = payload as Record<string, unknown>;
  const rawItems = Array.isArray(record.items)
    ? record.items
    : Array.isArray(record.orders)
      ? record.orders
      : [];
  const items = rawItems
    .filter((item): item is OrderRecordPayload => !!item && typeof item === 'object')
    .map((item) => mapOrderRecord(item));
  const metadata =
    record.metadata && typeof record.metadata === 'object'
      ? (record.metadata as Record<string, unknown>)
      : undefined;
  const totalMetadata =
    metadata && typeof metadata.total === 'number' ? metadata.total : undefined;
  const total =
    typeof record.total === 'number'
      ? record.total
      : totalMetadata !== undefined
        ? totalMetadata
        : items.length;
  const page = typeof record.page === 'number' ? record.page : 1;
  const pageSizeCandidate =
    typeof record.page_size === 'number'
      ? record.page_size
      : typeof record.pageSize === 'number'
        ? record.pageSize
        : items.length;
  const pageSize = pageSizeCandidate > 0 ? pageSizeCandidate : items.length;
  const hasNextMetadata =
    metadata && typeof metadata.has_next === 'boolean'
      ? metadata.has_next
      : metadata && typeof metadata.hasNext === 'boolean'
        ? metadata.hasNext
        : undefined;
  const hasNext =
    typeof record.has_next === 'boolean'
      ? record.has_next
      : typeof record.hasNext === 'boolean'
        ? record.hasNext
        : hasNextMetadata !== undefined
          ? hasNextMetadata
          : false;
  const metadataTimestamp =
    metadata && typeof metadata.timestamp === 'string'
      ? metadata.timestamp
      : undefined;
  const receivedAtCandidate =
    typeof record.received_at === 'string'
      ? record.received_at
      : typeof record.receivedAt === 'string'
        ? record.receivedAt
        : metadataTimestamp;
  const receivedAt = receivedAtCandidate ?? fallbackTimestamp ?? new Date().toISOString();
  return {
    items,
    total,
    page,
    pageSize: pageSize > 0 ? pageSize : items.length,
    hasNext,
    receivedAt
  };
};

const resolveOrderIdentifier = (payload: OrderEventPayload): string | null => {
  const candidates = [payload.id, payload.order_id, payload.client_order_id, payload.ib_order_id];
  for (const candidate of candidates) {
    if (candidate === undefined || candidate === null) {
      continue;
    }
    const text = String(candidate).trim();
    if (text) {
      return text;
    }
  }
  return null;
};

export class OrdersRealtimeClient {
  private socketHandle: WebSocketSubscription | null = null;
  private pollTimer: number | null = null;
  private pollingPromise: Promise<void> | null = null;
  private refreshTimer: number | null = null;
  private accountRefreshTimer: number | null = null;
  private strategyRefreshTimer: number | null = null;
  private started = false;
  private snapshotAvailable = false;
  private didInitialStrategyRefresh = false;
  private refreshAllStrategiesPending = false;
  private pendingStrategyRefreshes = new Set<string>();

  private readonly dispatch: AppDispatch;
  private readonly tokenProvider: () => string | null;
  private readonly stateProvider?: () => RootState;
  private readonly pollIntervalMs: number;
  private readonly refreshDebounceMs: number;

  constructor(options: OrdersRealtimeClientOptions) {
    this.dispatch = options.dispatch;
    this.tokenProvider = options.tokenProvider;
    this.stateProvider = options.stateProvider;
    this.pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL;
    this.refreshDebounceMs = options.refreshDebounceMs ?? DEFAULT_REFRESH_DEBOUNCE;
  }

  async connect() {
    if (this.started) {
      return;
    }
    this.started = true;
    this.snapshotAvailable = false;
    this.openSocket();
  }

  async disconnect() {
    this.started = false;
    this.snapshotAvailable = false;
    this.cancelPendingRefresh();
    if (this.accountRefreshTimer) {
      window.clearTimeout(this.accountRefreshTimer);
      this.accountRefreshTimer = null;
    }
    this.stopPolling();
    this.socketHandle?.dispose();
    this.socketHandle = null;
  }

  private openSocket() {
    const token = this.tokenProvider();
    if (!token) {
      this.dispatch(setConnectionStatus({ channel: 'orders', status: 'disconnected' }));
      this.snapshotAvailable = false;
      this.cancelPendingRefresh();
      this.startPolling();
      return;
    }
    this.dispatch(setConnectionStatus({ channel: 'orders', status: 'connecting' }));
    this.socketHandle?.dispose();
    this.socketHandle = subscribeWebSocket({
      name: 'ws',
      tokenProvider: this.tokenProvider,
      onOpen: () => {
        this.dispatch(setConnectionStatus({ channel: 'orders', status: 'connected' }));
        this.stopPolling();
        this.snapshotAvailable = false;
        if (!this.didInitialStrategyRefresh) {
          this.queueAllStrategiesRefresh();
          this.didInitialStrategyRefresh = true;
        }
        this.send({
          action: 'subscribe',
          topics: ['orders.status', 'orders.fill', 'orders.snapshot', 'orders.sync']
        });
      },
      onMessage: (data) => {
        this.handleMessage(data);
      },
      onError: () => {
        this.dispatch(setConnectionStatus({ channel: 'orders', status: 'connecting' }));
      },
      onClose: (event) => {
        if (isAuthenticationFailureCloseEvent(event)) {
          this.dispatch(logout());
          return;
        }
        this.dispatch(setConnectionStatus({ channel: 'orders', status: 'disconnected' }));
        this.snapshotAvailable = false;
        this.cancelPendingRefresh();
        if (this.started) {
          this.startPolling();
        }
      }
    });
  }

  private startPolling() {
    if (this.pollTimer || !this.started) {
      return;
    }
    this.pollTimer = window.setInterval(() => {
      if (!this.pollingPromise) {
        this.pollingPromise = this.pollOnce().finally(() => {
          this.pollingPromise = null;
        });
      }
    }, this.pollIntervalMs);
    void this.pollOnce();
  }

  private stopPolling() {
    if (this.pollTimer) {
      window.clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  private async pollOnce() {
    const token = this.tokenProvider();
    if (!token) {
      return;
    }
    try {
      await this.dispatch(fetchOrders()).unwrap();
      this.dispatch(
        setHeartbeat({
          channel: 'orders',
          timestamp: new Date().toISOString()
        })
      );
    } catch (error) {
      console.warn('轮询订单数据失败：', error);
    }
  }

  private scheduleRefresh() {
    if (this.snapshotAvailable || this.refreshTimer) {
      return;
    }
    this.refreshTimer = window.setTimeout(() => {
      this.refreshTimer = null;
      void this.pollOnce();
    }, this.refreshDebounceMs);
  }

  private cancelPendingRefresh() {
    if (this.refreshTimer) {
      window.clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
    }
  }

  private send(message: Record<string, unknown>) {
    this.socketHandle?.send(message);
  }

  private triggerAccountRefresh() {
    if (this.accountRefreshTimer) {
      return;
    }
    this.accountRefreshTimer = window.setTimeout(() => {
      this.accountRefreshTimer = null;
      void this.dispatch(refreshAccountPositions());
      void this.dispatch(refreshAccountSummary());
    }, this.refreshDebounceMs);
  }

  private queueAllStrategiesRefresh() {
    this.refreshAllStrategiesPending = true;
    this.scheduleStrategyRefresh();
  }

  private queueStrategyRefresh(strategyId: string | null): boolean {
    if (!strategyId) {
      return false;
    }
    this.pendingStrategyRefreshes.add(strategyId);
    this.scheduleStrategyRefresh();
    return true;
  }

  private scheduleStrategyRefresh() {
    if (this.strategyRefreshTimer) {
      return;
    }
    this.strategyRefreshTimer = window.setTimeout(() => {
      this.strategyRefreshTimer = null;
      this.performStrategyRefresh();
    }, this.refreshDebounceMs);
  }

  private cancelPendingStrategyRefresh() {
    if (this.strategyRefreshTimer) {
      window.clearTimeout(this.strategyRefreshTimer);
      this.strategyRefreshTimer = null;
    }
  }

  private performStrategyRefresh() {
    if (this.refreshAllStrategiesPending) {
      this.refreshAllStrategiesPending = false;
      this.pendingStrategyRefreshes.clear();
      void this.dispatch(loadStrategies({ refresh: true, period: 'day' }));
    } else {
      const ids = Array.from(this.pendingStrategyRefreshes);
      this.pendingStrategyRefreshes.clear();
      if (ids.length > 0) {
        void this.dispatch(loadStrategies({ refresh: true, period: 'day' }));
      }
    }
  }

  private emitOrderNotification(payload: OrderEventPayload, timestamp?: string) {
    const statusRaw = payload.status ? String(payload.status) : '';
    if (!statusRaw) {
      return;
    }
    const statusKey = statusRaw.replace(/\s+/g, '').toLowerCase();
    if (!ORDER_STATUS_EVENTS.has(statusKey)) {
      return;
    }

    const identifier = resolveOrderIdentifier(payload);
    const symbol = payload.symbol ? String(payload.symbol) : undefined;
    const filled = payload.filled_quantity ?? payload.filled;
    const formattedFilled =
      filled !== null && filled !== undefined && !Number.isNaN(Number(filled))
        ? Number(filled).toString()
        : null;

    const descriptors: Record<string, { title: string; message: string; severity: NotificationItem['severity']; event: string }> = {
      filled: {
        title: '订单已成交',
        message: `${symbol ?? '订单'}${identifier ? ` (${identifier})` : ''} 已成交${formattedFilled ? `，成交量 ${formattedFilled}` : ''}`,
        severity: 'info',
        event: 'order_filled'
      },
      cancelled: {
        title: '订单已撤销',
        message: `${symbol ?? '订单'}${identifier ? ` (${identifier})` : ''} 已撤销`,
        severity: 'warning',
        event: 'order_cancelled'
      },
      canceled: {
        title: '订单已撤销',
        message: `${symbol ?? '订单'}${identifier ? ` (${identifier})` : ''} 已撤销`,
        severity: 'warning',
        event: 'order_cancelled'
      },
      apicancelled: {
        title: '订单已撤销',
        message: `${symbol ?? '订单'}${identifier ? ` (${identifier})` : ''} 已撤销`,
        severity: 'warning',
        event: 'order_cancelled'
      },
      rejected: {
        title: '订单被拒绝',
        message: `${symbol ?? '订单'}${identifier ? ` (${identifier})` : ''} 被交易所拒绝`,
        severity: 'error',
        event: 'order_rejected'
      },
      inactive: {
        title: '订单已失效',
        message: `${symbol ?? '订单'}${identifier ? ` (${identifier})` : ''} 已失效`,
        severity: 'warning',
        event: 'order_inactive'
      }
    };

    const descriptor = descriptors[statusKey];
    if (!descriptor) {
      return;
    }

    const notification: NotificationItem = {
      id: `order-${identifier ?? symbol ?? 'unknown'}-${Date.now()}`,
      severity: descriptor.severity,
      title: descriptor.title,
      message: descriptor.message,
      timestamp: timestamp ?? new Date().toISOString(),
      channel: 'orders',
      status: statusRaw,
      event: descriptor.event
    };

    this.dispatch(pushNotification(notification));
  }

  private emitSyncNotification(payload: unknown, timestamp?: string) {
    if (!payload || typeof payload !== 'object') {
      return;
    }

    const record = payload as Record<string, unknown>;
    const statusRaw = typeof record.status === 'string' ? record.status.trim().toLowerCase() : '';
    if (!statusRaw) {
      return;
    }

    const updatedCountRaw = record.updated_count;
    const updatedCount =
      typeof updatedCountRaw === 'number'
        ? updatedCountRaw
        : Number.isFinite(Number(updatedCountRaw))
          ? Number(updatedCountRaw)
          : null;
    const jobId =
      typeof record.job_id === 'string' && record.job_id.trim()
        ? record.job_id.trim()
        : null;
    const errorText =
      typeof record.error === 'string' && record.error.trim()
        ? record.error.trim()
        : null;

    let notification: NotificationItem | null = null;
    if (statusRaw === 'succeeded') {
      const message =
        updatedCount !== null
          ? `后台订单同步完成，更新 ${updatedCount} 条订单`
          : '后台订单同步完成';
      notification = {
        id: `orders-sync-${jobId ?? 'completed'}-${Date.now()}`,
        severity: 'info',
        title: '订单同步完成',
        message,
        timestamp: timestamp ?? new Date().toISOString(),
        channel: 'orders',
        status: 'succeeded',
        event: 'orders_sync_completed'
      };
      this.scheduleRefresh();
    } else if (statusRaw === 'failed') {
      notification = {
        id: `orders-sync-${jobId ?? 'failed'}-${Date.now()}`,
        severity: 'error',
        title: '订单同步失败',
        message: errorText ? `后台订单同步失败：${errorText}` : '后台订单同步失败',
        timestamp: timestamp ?? new Date().toISOString(),
        channel: 'orders',
        status: 'failed',
        event: 'orders_sync_failed'
      };
    } else if (statusRaw === 'cancelled') {
      notification = {
        id: `orders-sync-${jobId ?? 'cancelled'}-${Date.now()}`,
        severity: 'warning',
        title: '订单同步已取消',
        message: '后台订单同步任务已取消',
        timestamp: timestamp ?? new Date().toISOString(),
        channel: 'orders',
        status: 'cancelled',
        event: 'orders_sync_cancelled'
      };
    }

    if (notification) {
      this.dispatch(pushNotification(notification));
    }
  }

  private handleMessage(raw: string) {
    let envelope: WebSocketEnvelope;
    try {
      envelope = JSON.parse(raw) as WebSocketEnvelope;
    } catch (error) {
      console.warn('无法解析订单 WebSocket 消息：', raw, error);
      return;
    }

    switch (envelope.type) {
      case 'event':
        this.handleEvent(envelope);
        break;
      case 'pong':
        this.dispatch(
          setHeartbeat({
            channel: 'orders',
            timestamp: new Date().toISOString()
          })
        );
        break;
      default:
        break;
    }
  }

  private handleEvent(envelope: WebSocketEnvelope) {
    if (!envelope.event) {
      return;
    }

    const payload = envelope.payload as OrderEventPayload | undefined;
    const timestamp = envelope.timestamp;
    let heartbeatTimestamp = timestamp;

    switch (envelope.event) {
      case 'orders.status':
        if (payload) {
          this.dispatch(upsertOrder(mapOrderRecord(payload)));
          this.scheduleRefresh();
          const statusText =
            typeof payload.status === 'string' ? payload.status.trim().toLowerCase() : '';
          const normalizedStatus = statusText.replace(/\s+/g, ' ');
          const strategyId = this.resolveStrategyId(payload);
          if (payload.status_changed !== false) {
            if (
              [
                'filled',
                'cancelled',
                'canceled',
                'api cancelled',
                'apicancelled',
                'rejected',
                'inactive'
              ].some((token) => normalizedStatus.includes(token))
            ) {
              this.triggerAccountRefresh();
              if (normalizedStatus.includes('filled')) {
                if (!this.queueStrategyRefresh(strategyId)) {
                  this.queueAllStrategiesRefresh();
                }
              }
            }
          }
          if (payload.status_changed !== false) {
            this.emitOrderNotification(payload, envelope.timestamp);
          }
        }
        break;
      case 'orders.fill':
        if (payload) {
          const update = mapOrderEventToChanges(payload);
          if (update) {
            this.dispatch(updateOrder(update));
          }
          this.scheduleRefresh();
          this.triggerAccountRefresh();
        }
        break;
      case 'orders.snapshot':
        {
          const snapshot = parseOrdersSnapshot(payload, timestamp);
          if (snapshot) {
            this.snapshotAvailable = true;
            this.cancelPendingRefresh();
            this.stopPolling();
            this.dispatch(setOrdersSnapshot(snapshot));
            heartbeatTimestamp = snapshot.receivedAt;
          }
        }
        break;
      case 'orders.sync':
        this.emitSyncNotification(envelope.payload, envelope.timestamp);
        break;
      default:
        break;
    }

    this.markHeartbeat(heartbeatTimestamp);
  }

  private resolveStrategyId(payload: OrderEventPayload): string | null {
    const metadata =
      payload.metadata && typeof payload.metadata === 'object'
        ? (payload.metadata as Record<string, unknown>)
        : null;
    const metadataStrategyName =
      metadata && typeof metadata.strategy_name === 'string' && metadata.strategy_name.trim()
        ? metadata.strategy_name.trim()
        : null;
    const metadataStrategy =
      metadata && typeof metadata.strategy === 'string' && metadata.strategy.trim()
        ? metadata.strategy.trim()
        : null;
    const candidateRaw =
      (typeof payload.strategy_name === 'string' && payload.strategy_name.trim()
        ? payload.strategy_name.trim()
        : null) ??
      (typeof payload.strategy === 'string' && payload.strategy.trim()
        ? payload.strategy.trim()
        : null) ??
      metadataStrategyName ??
      metadataStrategy;
    if (!candidateRaw) {
      return null;
    }
    if (/^\d+$/.test(candidateRaw)) {
      return candidateRaw;
    }
    if (!this.stateProvider) {
      return null;
    }
    const state = this.stateProvider();
    const normalized = candidateRaw.toLowerCase();
    const match = state.strategies.items.find((item) => {
      const idMatch = item.id.toLowerCase() === normalized;
      const nameMatch = item.name.toLowerCase() === normalized;
      const templateMatch =
        typeof item.templateId === 'string'
          ? item.templateId.toLowerCase() === normalized
          : false;
      return idMatch || nameMatch || templateMatch;
    });
    return match ? match.id : null;
  }

  private markHeartbeat(timestamp?: string) {
    let latency: number | undefined;
    if (timestamp) {
      const eventTime = Date.parse(timestamp);
      if (!Number.isNaN(eventTime)) {
        latency = Math.max(0, Date.now() - eventTime);
      }
    }

    this.dispatch(
      setHeartbeat({
        channel: 'orders',
        timestamp: new Date().toISOString(),
        latencyMs: latency
      })
    );
  }
}

export default OrdersRealtimeClient;
