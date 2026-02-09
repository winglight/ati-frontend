import type { AppDispatch, RootState } from '@store/index';
import { pushNotification } from '@store/slices/notificationsSlice';
import {
  pushRiskEvent,
  setRiskEvents,
  setRiskFallbackMode,
  setRiskMetrics
} from '@store/slices/riskSlice';
import { logout } from '@store/slices/authSlice';
import type { RiskEventItem } from '@features/risk/types';
import {
  fetchRiskEvents,
  fetchRiskMetrics,
  mapRiskEvents,
  mapRiskMetrics
} from './riskApi';
import type { RiskMetricsPayload } from './riskApi';
import {
  isAuthenticationFailureCloseEvent,
  subscribeWebSocket,
  type WebSocketSubscription
} from './websocketHub';

interface RiskRealtimeClientOptions {
  dispatch: AppDispatch;
  tokenProvider: () => string | null;
  stateProvider?: () => RootState;
  pollIntervalMs?: number;
  eventsLimit?: number;
}

interface WebSocketEnvelope {
  type?: string;
  event?: string;
  payload?: unknown;
  timestamp?: string;
  topics?: string[];
  action?: string;
}

interface RiskEventPayload {
  id?: string;
  rule_id?: string;
  rule?: { id?: string | null } | null;
  symbol: string;
  message: string;
  level: string;
  created_at: string;
  metrics?: Record<string, number | string | null> | null;
  actions?: Array<{
    action: string;
    symbol: string;
    side?: string | null;
    quantity?: number | null;
    description?: string | null;
  }> | null;
}

const DEFAULT_POLL_INTERVAL = 20000;
const DEFAULT_EVENTS_LIMIT = 30;

const toRiskEvent = (payload: RiskEventPayload): RiskEventItem => {
  const ruleId = payload.rule_id ?? payload.rule?.id ?? payload.id ?? 'unknown';
  return {
    id: payload.id ?? `${ruleId}:${payload.created_at}`,
    ruleId,
    symbol: payload.symbol,
  level: payload.level,
  message: payload.message,
  createdAt: payload.created_at,
  metrics: payload.metrics ?? null,
  actions: Array.isArray(payload.actions)
    ? payload.actions.map((action) => ({
        action: action.action,
        symbol: action.symbol,
        side: action.side ?? null,
        quantity: action.quantity ?? null,
        description: action.description ?? null
      }))
    : []
  };
};

const toNotificationSeverity = (level: string): 'info' | 'warning' | 'error' => {
  switch (level) {
    case 'critical':
    case 'error':
      return 'error';
    case 'warning':
      return 'warning';
    default:
      return 'info';
  }
};

export class RiskRealtimeClient {
  private readonly dispatch: AppDispatch;
  private readonly tokenProvider: () => string | null;
  private readonly stateProvider?: () => RootState;
  private readonly pollIntervalMs: number;
  private readonly eventsLimit: number;
  private socketHandle: WebSocketSubscription | null = null;
  private pollTimer: number | null = null;
  private pollingPromise: Promise<void> | null = null;
  private started = false;

  constructor(options: RiskRealtimeClientOptions) {
    this.dispatch = options.dispatch;
    this.tokenProvider = options.tokenProvider;
    this.stateProvider = options.stateProvider;
    this.pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL;
    this.eventsLimit = options.eventsLimit ?? DEFAULT_EVENTS_LIMIT;
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
    this.stopPolling();
    this.socketHandle?.dispose();
    this.socketHandle = null;
  }

  private openSocket() {
    const token = this.tokenProvider();
    if (!token) {
      this.dispatch(setRiskFallbackMode('http-polling'));
      this.startPolling();
      return;
    }
    this.socketHandle?.dispose();
    this.socketHandle = subscribeWebSocket({
      name: 'ws',
      tokenProvider: this.tokenProvider,
      onOpen: () => {
        this.dispatch(setRiskFallbackMode('websocket'));
        this.stopPolling();
        this.send({ action: 'subscribe', topics: ['risk.alert', 'risk.metric'] });
        void this.pollOnce();
      },
      onMessage: (data) => {
        this.handleMessage(data);
      },
      onError: () => {
        this.dispatch(setRiskFallbackMode('http-polling'));
      },
      onClose: (event) => {
        if (isAuthenticationFailureCloseEvent(event)) {
          this.dispatch(logout());
          return;
        }
        this.dispatch(setRiskFallbackMode('http-polling'));
        if (this.started) {
          this.startPolling();
        }
      }
    });
  }

  private handleMessage(raw: string) {
    try {
      const payload: WebSocketEnvelope = JSON.parse(raw);
      if (payload.type === 'event' && payload.event) {
        this.handleEvent(payload.event, payload.payload);
      }
    } catch (error) {
      console.warn('无法解析风控推送：', raw, error);
    }
  }

  private handleEvent(event: string, payload: unknown) {
    if (event === 'risk.alert') {
      this.handleAlert(payload as RiskEventPayload);
      return;
    }
    if (event === 'risk.metric') {
      this.handleMetric(payload);
    }
  }

  private handleAlert(payload: RiskEventPayload | undefined) {
    if (!payload) {
      return;
    }
    const event = toRiskEvent(payload);
    this.dispatch(pushRiskEvent(event));
    this.dispatch(
      pushNotification({
        id: event.id,
        severity: toNotificationSeverity(event.level),
        title: `风险告警 · ${event.symbol}`,
        message: event.message,
        timestamp: event.createdAt,
        channel: 'risk.alert',
        event: typeof event.metrics?.event === 'string' ? event.metrics.event : null
      })
    );
  }

  private syncGlobalHaltNotification(events: RiskEventItem[]) {
    if (!this.stateProvider) {
      return;
    }
    const state = this.stateProvider();
    const existingIds = new Set(state.notifications.items.map((item) => item.id));
    const haltEvent = events.find(
      (item) => typeof item.metrics?.event === 'string' && item.metrics.event === 'GLOBAL_TRADING_HALTED'
    );
    if (!haltEvent || existingIds.has(haltEvent.id)) {
      return;
    }
    this.dispatch(
      pushNotification({
        id: haltEvent.id,
        severity: toNotificationSeverity(haltEvent.level),
        title: `风险告警 · ${haltEvent.symbol}`,
        message: haltEvent.message,
        timestamp: haltEvent.createdAt,
        channel: 'risk.alert',
        event: 'GLOBAL_TRADING_HALTED'
      })
    );
  }

  private handleMetric(payload: unknown) {
    if (!payload) {
      return;
    }
    try {
      const summary = mapRiskMetrics(payload as RiskMetricsPayload);
      this.dispatch(setRiskMetrics(summary));
    } catch (error) {
      console.warn('解析风险指标推送失败：', error);
    }
  }

  private startPolling() {
    if (this.pollTimer || !this.started) {
      return;
    }
    this.dispatch(setRiskFallbackMode('http-polling'));
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
      const [metricsPayload, eventsPayload] = await Promise.all([
        fetchRiskMetrics(token),
        fetchRiskEvents(token, { limit: this.eventsLimit })
      ]);
      const metrics = mapRiskMetrics(metricsPayload);
      const events = mapRiskEvents(eventsPayload.items ?? []);
      this.dispatch(setRiskMetrics(metrics));
      this.dispatch(setRiskEvents(events));
      this.syncGlobalHaltNotification(events);
    } catch (error) {
      console.warn('轮询风控数据失败：', error);
    }
  }

  private send(message: Record<string, unknown>) {
    this.socketHandle?.send(message);
  }
}
