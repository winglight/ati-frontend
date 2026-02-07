import type { AppDispatch } from '@store/index';
import { setConnectionStatus, setHeartbeat, setSubscriptions, setClientId } from '@store/slices/realtimeSlice';
import { setAccountServiceWarning, setAccountSummary, setPositions } from '@store/slices/accountSlice';
import { logout } from '@store/slices/authSlice';
import {
  mapAccountSummary,
  mapAccountPositions,
  subscribeAccount,
  unsubscribeAccount,
  type AccountSummaryPayload,
  type AccountPositionsPayload,
  type AccountSubscriptionStatus,
  type FetchJsonResult,
  isAccountServiceUnavailable,
  ACCOUNT_SERVICE_OFFLINE_MESSAGE
} from './accountApi';
import {
  isAuthenticationFailureCloseEvent,
  subscribeWebSocket,
  type WebSocketSubscription
} from './websocketHub';

interface AccountRealtimeClientOptions {
  dispatch: AppDispatch;
  tokenProvider: () => string | null;
}

interface WebSocketEventPayload {
  type?: string;
  event?: string;
  payload?: unknown;
  topics?: string[];
  timestamp?: string;
  action?: string;
}

export interface AccountRealtimeDependencies {
  subscribeAccount: typeof subscribeAccount;
  unsubscribeAccount: typeof unsubscribeAccount;
  subscribeWebSocket: typeof subscribeWebSocket;
}

export const accountRealtimeDependencies: AccountRealtimeDependencies = {
  subscribeAccount,
  unsubscribeAccount,
  subscribeWebSocket
};

export class AccountRealtimeClient {
  private readonly dispatch: AppDispatch;
  private readonly tokenProvider: () => string | null;
  private socketHandle: WebSocketSubscription | null = null;
  private started = false;
  private subscribed = false;
  private offline = false;
  private retryTimer: number | null = null;

  constructor(options: AccountRealtimeClientOptions) {
    this.dispatch = options.dispatch;
    this.tokenProvider = options.tokenProvider;
  }

  async connect() {
    if (this.started) {
      return;
    }
    this.started = true;
    await this.refreshConnection();
  }

  async disconnect() {
    this.started = false;
    this.clearRetryTimer();
    this.socketHandle?.dispose();
    this.socketHandle = null;
    this.offline = false;
    await this.releaseSubscription();
  }

  private async ensureSubscription(): Promise<boolean> {
    if (this.subscribed) {
      return true;
    }
    const token = this.tokenProvider();
    if (!token) {
      return false;
    }
    try {
      const result = await accountRealtimeDependencies.subscribeAccount(token);
      if (this.isOfflineResponse(result)) {
        this.handleOffline(result?.serviceStatus);
        return false;
      }
      this.offline = false;
      this.subscribed = true;
      this.clearRetryTimer();
      this.retryAttempt = 0;
      return true;
    } catch (error) {
      console.warn('Failed to subscribe account updates:', error);
      return false;
    }
  }

  private async releaseSubscription() {
    if (!this.subscribed) {
      return;
    }
    const token = this.tokenProvider();
    if (!token) {
      this.subscribed = false;
      return;
    }
    try {
      await accountRealtimeDependencies.unsubscribeAccount(token);
    } catch (error) {
      console.warn('Failed to unsubscribe account updates:', error);
    } finally {
      this.subscribed = false;
    }
  }

  private async refreshConnection() {
    const subscribed = await this.ensureSubscription();
    if (!this.started) {
      return;
    }
    if (subscribed) {
      this.openSocket();
      return;
    }
    this.scheduleRetry();
  }

  private clearRetryTimer() {
    if (this.retryTimer) {
      window.clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
  }

  private retryAttempt = 0;
  private scheduleRetry() {
    if (this.retryTimer || !this.started) {
      return;
    }
    this.retryAttempt = Math.max(1, this.retryAttempt + 1);
    const base = 2000;
    const maxDelay = 60000;
    let delay = Math.min(maxDelay, base * Math.pow(2, this.retryAttempt - 1));
    const jitter = delay * (0.1 + Math.random() * 0.1);
    delay = Math.floor(delay + jitter);
    this.retryTimer = window.setTimeout(() => {
      this.retryTimer = null;
      if (!this.started) {
        return;
      }
      void this.refreshConnection();
    }, delay);
  }

  private handleOffline(message?: string | null) {
    const warning =
      typeof message === 'string' && message.trim()
        ? message.trim()
        : ACCOUNT_SERVICE_OFFLINE_MESSAGE;
    this.dispatch(setAccountServiceWarning(warning));
    this.subscribed = false;
    if (!this.offline) {
      this.offline = true;
      this.dispatch(setConnectionStatus({ channel: 'account', status: 'offline' }));
      this.socketHandle?.dispose();
      this.socketHandle = null;
    }
    this.scheduleRetry();
  }

  private isOfflineResponse(
    result: FetchJsonResult<AccountSubscriptionStatus>
  ): boolean {
    const status = result?.data?.status;
    if (typeof status === 'string' && status.toLowerCase() === 'offline') {
      return true;
    }
    return isAccountServiceUnavailable(result?.serviceStatus);
  }

  private openSocket() {
    const token = this.tokenProvider();
    if (this.offline) {
      this.dispatch(setConnectionStatus({ channel: 'account', status: 'offline' }));
      return;
    }
    if (!token) {
      this.dispatch(setConnectionStatus({ channel: 'account', status: 'disconnected' }));
      this.scheduleRetry();
      return;
    }
    this.dispatch(setConnectionStatus({ channel: 'account', status: 'connecting' }));
    this.socketHandle?.dispose();
    this.socketHandle = accountRealtimeDependencies.subscribeWebSocket({
      name: 'ws',
      tokenProvider: this.tokenProvider,
      onOpen: () => {
        this.dispatch(setConnectionStatus({ channel: 'account', status: 'connected' }));
        this.send({ action: 'subscribe', topics: ['account.snapshot', 'positions.update'] });
      },
      onMessage: (data) => {
        this.handleMessage(data);
      },
      onError: () => {
        this.dispatch(setConnectionStatus({ channel: 'account', status: 'connecting' }));
      },
      onClose: (event) => {
        if (isAuthenticationFailureCloseEvent(event)) {
          this.dispatch(logout());
          return;
        }
        this.dispatch(setConnectionStatus({ channel: 'account', status: 'disconnected' }));
        this.scheduleRetry();
      }
    });
  }


  private handleMessage(raw: string) {
    try {
      const payload: WebSocketEventPayload = JSON.parse(raw);
      switch (payload.type) {
        case 'welcome':
          // Capture client identity from welcome payload if provided
          try {
            const clientId = (payload as unknown as { client_id?: string }).client_id;
            if (typeof clientId === 'string' && clientId.trim()) {
              this.dispatch(setClientId(clientId));
            }
          } catch {
            /* noop */
          }
          if (Array.isArray(payload.topics)) {
            this.dispatch(setSubscriptions(payload.topics));
          }
          break;
        case 'ack':
          if (payload.action === 'subscribe' && Array.isArray(payload.topics)) {
            this.dispatch(setSubscriptions(payload.topics));
          }
          break;
        case 'event':
          this.handleEvent(payload);
          break;
        case 'pong':
          this.dispatch(
            setHeartbeat({
              channel: 'account',
              timestamp: new Date().toISOString()
            })
          );
          break;
        default:
          break;
      }
    } catch (error) {
      console.warn('无法解析 WebSocket 消息：', raw, error);
    }
  }

  private handleEvent(payload: WebSocketEventPayload) {
    if (!payload.event) {
      return;
    }

    if (payload.timestamp) {
      const eventTime = Date.parse(payload.timestamp);
      if (!Number.isNaN(eventTime)) {
        const latency = Math.max(0, Date.now() - eventTime);
        this.dispatch(
          setHeartbeat({
            channel: 'account',
            timestamp: new Date().toISOString(),
            latencyMs: latency
          })
        );
      }
    }

    switch (payload.event) {
      case 'account.snapshot':
        this.handleAccountSnapshot(payload.payload);
        break;
      case 'positions.update':
        this.handlePositionsUpdate(payload.payload);
        break;
      default:
        break;
    }
  }

  private handleAccountSnapshot(data: unknown) {
    if (!data || typeof data !== 'object') {
      return;
    }
    try {
      const summary = mapAccountSummary(data as AccountSummaryPayload);
      this.dispatch(setAccountSummary(summary));
      this.dispatch(setAccountServiceWarning(null));
    } catch (error) {
      console.warn('处理账户快照失败：', error);
    }
  }

  private handlePositionsUpdate(data: unknown) {
    if (!data || typeof data !== 'object') {
      return;
    }
    try {
      const positions = mapAccountPositions(data as AccountPositionsPayload);
      this.dispatch(setPositions(positions));
      this.dispatch(setAccountServiceWarning(null));
    } catch (error) {
      console.warn('处理持仓更新失败：', error);
    }
  }

  private send(message: Record<string, unknown>) {
    this.socketHandle?.send(message);
  }
}
