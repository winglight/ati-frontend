import type { AppDispatch } from '@store/index';
import { setConnectionStatus, setHeartbeat } from '@store/slices/realtimeSlice';
import { logout } from '@store/slices/authSlice';
import { pushNotification } from '@store/slices/notificationsSlice';
import { fetchNotifications } from '@store/thunks/notifications';
import { mapNotificationRecord, type NotificationRecordPayload } from './notificationsApi';
import {
  isAuthenticationFailureCloseEvent,
  subscribeWebSocket,
  type WebSocketSubscription
} from './websocketHub';

interface NotificationsRealtimeClientOptions {
  dispatch: AppDispatch;
  tokenProvider: () => string | null;
  pollIntervalMs?: number;
  refreshDebounceMs?: number;
  pageSize?: number;
}

interface WebSocketEnvelope {
  type?: string;
  event?: string;
  payload?: unknown;
  timestamp?: string;
  action?: string;
}

const DEFAULT_POLL_INTERVAL = 20000;
const DEFAULT_REFRESH_DEBOUNCE = 1500;
const DEFAULT_PAGE_SIZE = 30;

export class NotificationsRealtimeClient {
  private socketHandle: WebSocketSubscription | null = null;
  private pollTimer: number | null = null;
  private pollingPromise: Promise<void> | null = null;
  private refreshTimer: number | null = null;
  private started = false;

  private readonly dispatch: AppDispatch;
  private readonly tokenProvider: () => string | null;
  private readonly pollIntervalMs: number;
  private readonly refreshDebounceMs: number;
  private readonly pageSize: number;

  constructor(options: NotificationsRealtimeClientOptions) {
    this.dispatch = options.dispatch;
    this.tokenProvider = options.tokenProvider;
    this.pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL;
    this.refreshDebounceMs = options.refreshDebounceMs ?? DEFAULT_REFRESH_DEBOUNCE;
    this.pageSize = options.pageSize ?? DEFAULT_PAGE_SIZE;
  }

  async connect() {
    if (this.started) {
      return;
    }
    this.started = true;
    this.openSocket();
  }

  async disconnect() {
    this.started = false;
    if (this.refreshTimer) {
      window.clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
    }
    this.stopPolling();
    this.socketHandle?.dispose();
    this.socketHandle = null;
  }

  private openSocket() {
    const token = this.tokenProvider();
    if (!token) {
      this.dispatch(setConnectionStatus({ channel: 'notifications', status: 'disconnected' }));
      this.startPolling();
      return;
    }
    this.dispatch(setConnectionStatus({ channel: 'notifications', status: 'connecting' }));
    this.socketHandle?.dispose();
    this.socketHandle = subscribeWebSocket({
      name: 'ws',
      tokenProvider: this.tokenProvider,
      onOpen: () => {
        this.dispatch(setConnectionStatus({ channel: 'notifications', status: 'connected' }));
        this.stopPolling();
        this.send({ action: 'subscribe', topics: ['notifications'] });
      },
      onMessage: (data) => {
        this.handleMessage(data);
      },
      onError: () => {
        this.dispatch(setConnectionStatus({ channel: 'notifications', status: 'connecting' }));
      },
      onClose: (event) => {
        if (isAuthenticationFailureCloseEvent(event)) {
          this.dispatch(logout());
          return;
        }
        this.dispatch(setConnectionStatus({ channel: 'notifications', status: 'disconnected' }));
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
      await this.dispatch(fetchNotifications({ limit: this.pageSize })).unwrap();
      this.dispatch(
        setHeartbeat({
          channel: 'notifications',
          timestamp: new Date().toISOString()
        })
      );
    } catch (error) {
      console.warn('轮询通知数据失败：', error);
    }
  }

  private scheduleRefresh() {
    if (this.refreshTimer) {
      return;
    }
    this.refreshTimer = window.setTimeout(() => {
      this.refreshTimer = null;
      void this.pollOnce();
    }, this.refreshDebounceMs);
  }

  private send(message: Record<string, unknown>) {
    this.socketHandle?.send(message);
  }

  private handleMessage(raw: string) {
    let envelope: WebSocketEnvelope;
    try {
      envelope = JSON.parse(raw) as WebSocketEnvelope;
    } catch (error) {
      console.warn('无法解析通知 WebSocket 消息：', raw, error);
      return;
    }

    switch (envelope.type) {
      case 'event':
        this.handleEvent(envelope);
        break;
      case 'pong':
        this.dispatch(
          setHeartbeat({
            channel: 'notifications',
            timestamp: new Date().toISOString()
          })
        );
        break;
      default:
        break;
    }
  }

  private handleEvent(envelope: WebSocketEnvelope) {
    if (envelope.event !== 'notifications') {
      return;
    }

    const payload = envelope.payload as NotificationRecordPayload | undefined;
    if (!payload) {
      return;
    }

    const notification = mapNotificationRecord(payload);
    this.dispatch(pushNotification(notification));
    this.scheduleRefresh();
    this.markHeartbeat(envelope.timestamp);
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
        channel: 'notifications',
        timestamp: new Date().toISOString(),
        latencyMs: latency
      })
    );
  }
}

export default NotificationsRealtimeClient;
