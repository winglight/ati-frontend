import type { AppDispatch } from '@store/index';
import type {
  DepthSnapshot,
  MarketAvailability,
  MarketBar,
  MarketConnectionStatus,
  MarketTickerSnapshot,
  SymbolInfo
} from '@features/dashboard/types';
import { extractRootSymbol, normalizePriceByTick } from '@features/dashboard/utils/priceFormatting';

import {
  resetMarketSubscription,
  setMarketConnectionStatus,
  setMarketAvailability,
  setMarketKlineSnapshot,
  setMarketSubscriptionFailed,
  setMarketSubscriptionPending,
  setMarketSubscriptionReady,
  setTickerSnapshot,
  updateDepthSnapshot,
  upsertMarketBar
} from '@store/slices/marketSlice';
import { updatePositionPricing } from '@store/slices/accountSlice';
import { logout } from '@store/slices/authSlice';
import { addToast } from '@store/slices/toastSlice';
import { normalizeTimestampToUtc } from '@utils/timezone';
import {
  normalizeBarEventPayload,
  normalizeDepthPayload,
  normalizeTickerPayload,
  type NormalizeBarEventContext,
  type NormalizedBarEvent
} from './marketNormalization';
import { emitMarketRealtimeMetric } from './marketTelemetry';
import { resolveAggregationWindow } from './marketApi';
const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);
import {
  isAuthenticationFailureCloseEvent,
  subscribeWebSocket,
  type WebSocketSubscription,
  MANAGED_WS_HEARTBEAT_INTERVAL_MS
} from './websocketHub';

export {
  normalizeBarEventPayload,
  normalizeDepthPayload,
  normalizeTickerPayload
};
export type { NormalizeBarEventContext, NormalizedBarEvent };

interface MarketRealtimeClientOptions {
  dispatch: AppDispatch;
  tokenProvider: () => string | null;
  symbolProvider: () => string | null;
  timeframeProvider: () => string | null;
  durationProvider?: () => number | null;
  symbolMetadataProvider?: (symbol: string | null) => SymbolInfo | null;
}

interface WebSocketEventPayload {
  type?: string;
  event?: string;
  topic?: string;
  channel?: string;
  payload?: unknown;
  data?: unknown;
  topics?: string[];
  timestamp?: string;
  action?: string;
}

interface SubscriptionAckPayload extends WebSocketEventPayload {
  symbol?: string | null;
  timeframe?: string | null;
  subscriptionId?: string | null;
  subscription_id?: string | null;
  metadata?: Record<string, unknown> | null;
  capabilities?: Record<string, unknown> | null;
  snapshot?: Record<string, unknown> | null;
  snapshots?: Record<string, unknown> | unknown[] | null;
  error?: unknown;
  ok?: boolean;
  success?: boolean;
  status?: string;
  message?: string;
}

interface AckSnapshotResult {
  depthApplied: boolean;
  tickerApplied: boolean;
  barApplied: boolean;
  historyApplied: boolean;
}

interface HistoricalBarsContext {
  symbol?: string | null;
  timeframe?: string | null;
  intervalSeconds?: number | null;
  durationSeconds?: number | null;
}

const DEFAULT_SUBSCRIPTION_TOPICS = [
  'market.dom',
  'market.depth',
  'market.ticker',
  'market.bar'
] as const;

const DOM_TOPIC_BASES = ['market.dom', 'market.depth'] as const;
const DOM_CAPABILITY_KEYS = [
  'market.dom',
  'market.depth',
  'dom',
  'depth',
  'enable_dom',
  'enable_depth',
  'has_dom',
  'has_depth',
  'supports_dom',
  'supports_depth'
] as const;

const DOM_TOPIC_BASE_SET = new Set<string>(DOM_TOPIC_BASES);
const DOM_CAPABILITY_KEY_SET = new Set(DOM_CAPABILITY_KEYS.map((key) => key.toLowerCase()));
const FUTURE_EXCHANGE_HINTS = new Set([
  'CME',
  'CBOT',
  'NYMEX',
  'COMEX',
  'ICE',
  'ICEUS',
  'ICEEU',
  'EUREX',
  'SGX',
  'CFE'
]);
const EQUITY_EXCHANGE_HINTS = new Set(['SMART', 'NASDAQ', 'NYSE', 'ARCA', 'BATS', 'IEX']);

const KNOWN_TOPIC_BASES = [
  'market.dom',
  'market.depth',
  'market.ticker',
  'market.bar',
  'market.kline',
  'dom',
  'depth',
  'ticker',
  'bar',
  'bars',
  'kline'
] as const;

const HEARTBEAT_INTERVAL_MS = 10000;
const HEARTBEAT_TIMEOUT_MARGIN_MS = 10000;
const HEARTBEAT_TIMEOUT_MS = MANAGED_WS_HEARTBEAT_INTERVAL_MS + HEARTBEAT_TIMEOUT_MARGIN_MS;
const RECONNECT_BASE_DELAY_MS = 1000;
const RECONNECT_MAX_DELAY_MS = 30000;
const LOG_PREFIX = '[MarketRealtime]';
const DEBUG_LOGGING_ENABLED = Boolean(import.meta?.env?.DEV);

type TimerHost = Pick<
  typeof globalThis,
  'setInterval' | 'clearInterval' | 'setTimeout' | 'clearTimeout'
>;

export class MarketRealtimeClient {
  private readonly dispatch: AppDispatch;
  private readonly tokenProvider: () => string | null;
  private readonly symbolProvider: () => string | null;
  private readonly timeframeProvider: () => string | null;
  private readonly durationProvider?: () => number | null;
  private readonly symbolMetadataProvider?: (symbol: string | null) => SymbolInfo | null;
  private socketHandle: WebSocketSubscription | null = null;
  private started = false;
  private lastSubscribedSymbol: string | null = null;
  private lastSubscribedTimeframe: string | null = null;
  private lastRequestedSymbol: string | null = null;
  private lastRequestedTimeframe: string | null = null;
  private lastActivityAt = Date.now();
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: number | null = null;
  private reconnectAttempt = 0;
  private lastSubscribedTopics: string[] = [];
  private lastSubscriptionRequestedAt: number | null = null;
  private lastConnectionOpenedAt: number | null = null;
  private lastSubscriptionCapabilities: Record<string, unknown> | null = null;
  private lastCapabilitiesSymbol: string | null = null;

  constructor(options: MarketRealtimeClientOptions) {
    this.dispatch = options.dispatch;
    this.tokenProvider = options.tokenProvider;
    this.symbolProvider = options.symbolProvider;
    this.timeframeProvider = options.timeframeProvider;
    this.durationProvider = options.durationProvider;
    this.symbolMetadataProvider = options.symbolMetadataProvider;
    this.lastSubscribedTopics = this.getDefaultTopics(this.symbolProvider());
  }

  async connect(options: { force?: boolean } = {}) {
    if (this.started && !options.force) {
      return;
    }
    this.log('connect requested', { force: options.force === true });
    this.started = true;
    if (options.force) {
      this.stopHeartbeat();
      this.socketHandle?.dispose();
      this.socketHandle = null;
    }
    this.clearReconnectTimer();
    this.reconnectAttempt = 0;
    this.updateConnectionStatus('connecting');
    this.openSocket();
  }

  async disconnect() {
    this.started = false;
    this.log('disconnect requested');
    this.stopHeartbeat();
    this.clearReconnectTimer();
    this.reconnectAttempt = 0;
    this.socketHandle?.dispose();
    this.socketHandle = null;
    this.lastSubscribedSymbol = null;
    this.lastSubscribedTimeframe = null;
    this.lastRequestedSymbol = null;
    this.lastRequestedTimeframe = null;
    this.lastSubscribedTopics = this.getDefaultTopics(this.symbolProvider());
    this.lastSubscriptionRequestedAt = null;
    this.lastConnectionOpenedAt = null;
    this.lastSubscriptionCapabilities = null;
    this.lastCapabilitiesSymbol = null;
    emitMarketRealtimeMetric({ type: 'market.realtime.socket.closed', reason: 'manual' });
    this.dispatch(resetMarketSubscription());
  }

  private touchActivity() {
    this.lastActivityAt = Date.now();
  }

  private getTimerHost(): TimerHost {
    return (typeof window !== 'undefined' ? window : globalThis) as TimerHost;
  }

  private clearReconnectTimer() {
    if (this.reconnectTimer) {
      this.getTimerHost().clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private updateConnectionStatus(status: MarketConnectionStatus, error?: string | null) {
    this.dispatch(
      setMarketConnectionStatus({
        status,
        error: error ?? null
      })
    );
    emitMarketRealtimeMetric({ type: 'market.realtime.connection_status', status, error: error ?? null });
  }

  private scheduleReconnect({ reason, immediate }: { reason: string; immediate?: boolean }) {
    if (!this.started) {
      return;
    }
    if (this.reconnectTimer) {
      return;
    }
    this.reconnectAttempt += 1;
    const delay = immediate
      ? 0
      : Math.min(
          RECONNECT_MAX_DELAY_MS,
          RECONNECT_BASE_DELAY_MS * Math.pow(2, Math.max(0, this.reconnectAttempt - 1))
        );
    this.log('scheduling WebSocket reconnect', { reason, attempt: this.reconnectAttempt, delay });
    emitMarketRealtimeMetric({
      type: 'market.realtime.reconnect_scheduled',
      reason,
      attempt: this.reconnectAttempt,
      delayMs: delay
    });
    this.stopHeartbeat();
    this.socketHandle?.dispose();
    this.socketHandle = null;
    this.updateConnectionStatus('reconnecting');
    const timerHost = this.getTimerHost();
    this.reconnectTimer = timerHost.setTimeout(() => {
      this.reconnectTimer = null;
      if (!this.started) {
        return;
      }
      this.openSocket();
    }, delay) as unknown as number;
  }

  private startHeartbeat() {
    if (this.heartbeatTimer) {
      return;
    }
    const timerHost = this.getTimerHost();
    this.heartbeatTimer = timerHost.setInterval(() => {
      void this.checkHeartbeat();
    }, HEARTBEAT_INTERVAL_MS);
  }

  private stopHeartbeat() {
    if (this.heartbeatTimer) {
      this.getTimerHost().clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private async checkHeartbeat() {
    if (!this.started) {
      return;
    }
    const now = Date.now();
    const elapsed = now - this.lastActivityAt;
    if (elapsed < HEARTBEAT_TIMEOUT_MS) {
      return;
    }
    const symbol = this.lastSubscribedSymbol ?? this.symbolProvider();
    if (!symbol) {
      this.lastActivityAt = now;
      return;
    }
    const timeframe = this.lastSubscribedTimeframe ?? this.timeframeProvider();
    const topics = this.lastSubscribedTopics.length
      ? this.lastSubscribedTopics
      : this.getDefaultTopics(symbol);
    this.log('heartbeat timeout detected, scheduling reconnect', {
      inactivityMs: elapsed,
      symbol,
      timeframe,
      topics
    });
    emitMarketRealtimeMetric({
      type: 'market.realtime.heartbeat_timeout',
      inactivityMs: elapsed,
      symbol,
      timeframe,
      topics
    });
    this.lastActivityAt = now;
    this.scheduleReconnect({ reason: 'heartbeat-timeout' });
  }

  private resolveSymbolMetadata(symbol: string | null) {
    if (!this.symbolMetadataProvider) {
      return null;
    }
    try {
      return this.symbolMetadataProvider(symbol) ?? null;
    } catch (error) {
      this.warn('symbolMetadataProvider error', error);
      return null;
    }
  }

  private resolveDomPreferenceFromMetadata(metadata: SymbolInfo | null): boolean | null {
    if (!metadata) {
      return null;
    }
    if (typeof metadata.domCapable === 'boolean') {
      return metadata.domCapable;
    }
    const secType = typeof metadata.secType === 'string' ? metadata.secType.trim().toUpperCase() : '';
    if (secType) {
      if (['STK', 'ETF', 'CFD'].includes(secType)) {
        return false;
      }
      if (['FUT', 'FOP', 'FUTOPT', 'FWD', 'CMDTY'].includes(secType)) {
        return true;
      }
    }
    const exchange = typeof metadata.exchange === 'string' ? metadata.exchange.trim().toUpperCase() : '';
    if (exchange) {
      if (FUTURE_EXCHANGE_HINTS.has(exchange)) {
        return true;
      }
      if (EQUITY_EXCHANGE_HINTS.has(exchange)) {
        return false;
      }
    }
    return null;
  }

  private parseCapabilityFlag(value: unknown): boolean | null {
    if (typeof value === 'boolean') {
      return value;
    }
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) {
        return null;
      }
      if (value === 0) {
        return false;
      }
      if (value === 1) {
        return true;
      }
      return value > 0;
    }
    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();
      if (!normalized) {
        return null;
      }
      if (['true', '1', 'yes', 'y', 'enabled', 'on'].includes(normalized)) {
        return true;
      }
      if (['false', '0', 'no', 'n', 'disabled', 'off'].includes(normalized)) {
        return false;
      }
    }
    if (Array.isArray(value)) {
      let hasFalse = false;
      for (const entry of value) {
        const parsed = this.parseCapabilityFlag(entry);
        if (parsed === true) {
          return true;
        }
        if (parsed === false) {
          hasFalse = true;
        }
      }
      return hasFalse ? false : null;
    }
    if (this.isRecord(value)) {
      let hasFalse = false;
      for (const nested of Object.values(value)) {
        const parsed = this.parseCapabilityFlag(nested);
        if (parsed === true) {
          return true;
        }
        if (parsed === false) {
          hasFalse = true;
        }
      }
      return hasFalse ? false : null;
    }
    return null;
  }

  private findCapabilityFlag(
    source: unknown,
    matcher: (key: string) => boolean,
    visited = new Set<unknown>()
  ): boolean | null {
    if (!source || visited.has(source)) {
      return null;
    }
    if (Array.isArray(source)) {
      let hasFalse = false;
      for (const entry of source) {
        const parsed = this.findCapabilityFlag(entry, matcher, visited);
        if (parsed === true) {
          return true;
        }
        if (parsed === false) {
          hasFalse = true;
        }
      }
      return hasFalse ? false : null;
    }
    if (!this.isRecord(source)) {
      return null;
    }
    visited.add(source);
    let hasFalse = false;
    for (const [key, value] of Object.entries(source)) {
      const normalizedKey = key.trim().toLowerCase();
      if (matcher(normalizedKey)) {
        const parsed = this.parseCapabilityFlag(value);
        if (parsed === true) {
          return true;
        }
        if (parsed === false) {
          hasFalse = true;
        }
      }
      if (value && typeof value === 'object') {
        const nested = this.findCapabilityFlag(value, matcher, visited);
        if (nested === true) {
          return true;
        }
        if (nested === false) {
          hasFalse = true;
        }
      }
    }
    return hasFalse ? false : null;
  }

  private resolveDomPreferenceFromCapabilities(symbol: string | null): boolean | null {
    if (!symbol) {
      return null;
    }
    const normalized = symbol.trim().toUpperCase();
    if (!normalized) {
      return null;
    }
    if (!this.lastSubscriptionCapabilities) {
      return null;
    }
    if ((this.lastCapabilitiesSymbol ?? '').toUpperCase() !== normalized) {
      return null;
    }
    return this.findCapabilityFlag(this.lastSubscriptionCapabilities, (key) =>
      DOM_CAPABILITY_KEY_SET.has(key)
    );
  }

  private shouldIncludeDomTopicsForSymbol(symbol: string | null): boolean {
    const metadata = this.resolveSymbolMetadata(symbol);
    const metadataPreference = this.resolveDomPreferenceFromMetadata(metadata);
    if (metadataPreference === false) {
      return false;
    }
    if (metadataPreference === true) {
      return true;
    }
    const capabilityPreference = this.resolveDomPreferenceFromCapabilities(symbol);
    if (capabilityPreference !== null) {
      return capabilityPreference;
    }
    return true;
  }

  private normalizeRealtimePrice(
    symbol: string | null,
    price: number | null | undefined,
    reference?: number | null,
  ): number | null {
    if (!isFiniteNumber(price)) {
      return null;
    }
    const metadata = this.resolveSymbolMetadata(symbol);
    const normalized =
      normalizePriceByTick(price, symbol ?? undefined, {
        tickSize: metadata?.tickSize ?? undefined,
        reference: reference ?? undefined
      }) ?? price;
    return normalized;
  }

  private normalizeTickerSnapshot(
    ticker: MarketTickerSnapshot,
    fallbackSymbol?: string | null,
  ): MarketTickerSnapshot {
    const hintSymbol = fallbackSymbol ?? null;
    const subscriptionSymbol = this.symbolProvider();
    const targetSymbol = hintSymbol ?? subscriptionSymbol ?? null;
    const observedSymbol = ticker.symbol ?? undefined;
    let resolvedSymbol = observedSymbol ?? targetSymbol ?? subscriptionSymbol ?? '';
    if (targetSymbol) {
      const targetRoot = extractRootSymbol(targetSymbol);
      const snapshotRoot = extractRootSymbol(resolvedSymbol);
      if (targetRoot && snapshotRoot && targetRoot === snapshotRoot && resolvedSymbol !== targetSymbol) {
        this.log('normalized ticker snapshot symbol to match selection', {
          original: resolvedSymbol,
          normalized: targetSymbol
        });
        resolvedSymbol = targetSymbol;
      }
    }
    const metadata = this.resolveSymbolMetadata(resolvedSymbol);
    const tickSize = metadata?.tickSize ?? undefined;

    const normalizedLast = normalizePriceByTick(ticker.last, resolvedSymbol, {
      tickSize,
      reference: ticker.close ?? undefined
    });
    const normalizedClose = normalizePriceByTick(ticker.close, resolvedSymbol, {
      tickSize,
      reference: normalizedLast ?? ticker.last ?? undefined
    });
    const reference = normalizedLast ?? normalizedClose ?? undefined;
    const normalizedBid = normalizePriceByTick(ticker.bid, resolvedSymbol, {
      tickSize,
      reference
    });
    const normalizedAsk = normalizePriceByTick(ticker.ask, resolvedSymbol, {
      tickSize,
      reference
    });
    const normalizedMid = normalizePriceByTick(ticker.midPrice, resolvedSymbol, {
      tickSize,
      reference
    });

    const result: MarketTickerSnapshot = {
      ...ticker,
      symbol: resolvedSymbol
    };

    if (normalizedLast != null) {
      result.last = normalizedLast;
    }
    if (normalizedClose != null) {
      result.close = normalizedClose;
    }
    if (normalizedBid != null) {
      result.bid = normalizedBid;
    }
    if (normalizedAsk != null) {
      result.ask = normalizedAsk;
    }
    if (normalizedMid != null) {
      result.midPrice = normalizedMid;
    }

    if (isFiniteNumber(result.bid) && isFiniteNumber(result.ask)) {
      const mid = Number((((result.bid as number) + (result.ask as number)) / 2).toFixed(6));
      result.midPrice = mid;
      result.spread = Number(Math.abs((result.ask as number) - (result.bid as number)).toFixed(6));
    }

    if (isFiniteNumber(result.last) && isFiniteNumber(result.close)) {
      const change = Number(((result.last as number) - (result.close as number)).toFixed(6));
      result.change = change;
      const denominator = Math.abs(result.close as number);
      result.changePercent = denominator > 1e-6 ? Number(((change / (result.close as number)) * 100).toFixed(6)) : null;
    }

    return result;
  }

  private openSocket() {
    const token = this.tokenProvider();
    if (!token) {
      this.log('no token available, unable to open WebSocket');
      this.dispatch(resetMarketSubscription());
      this.updateConnectionStatus('failed', '缺少行情访问令牌');
      this.started = false;
      return;
    }
    const symbolName = this.symbolProvider() ?? undefined;
    const connectionName = symbolName && symbolName.trim() ? symbolName.trim() : 'ws';
    this.socketHandle?.dispose();
    this.log('opening WebSocket connection', { connectionName, symbolName });
    this.clearReconnectTimer();
    this.updateConnectionStatus('connecting');
    this.lastConnectionOpenedAt = Date.now();
    this.socketHandle = subscribeWebSocket({
      name: connectionName,
      tokenProvider: this.tokenProvider,
      onOpen: () => {
        this.log('WebSocket opened');
        this.touchActivity();
        this.startHeartbeat();
        this.clearReconnectTimer();
        const attempt = this.reconnectAttempt;
        const latency = this.lastConnectionOpenedAt != null ? Date.now() - this.lastConnectionOpenedAt : null;
        this.reconnectAttempt = 0;
        this.updateConnectionStatus('connected');
        emitMarketRealtimeMetric({
          type: 'market.realtime.socket.opened',
          attempt,
          latencyMs: latency
        });
        this.subscribeToTopics({ force: true });
      },
      onMessage: (data) => {
        this.log('WebSocket message received', { raw: data });
        this.handleMessage(data);
      },
      onError: () => {
        this.warn('WebSocket error encountered');
        this.stopHeartbeat();
        emitMarketRealtimeMetric({ type: 'market.realtime.socket.error', reason: 'socket-error' });
        this.scheduleReconnect({ reason: 'socket-error' });
      },
      onClose: (event) => {
        this.warn('WebSocket closed', event);
        this.stopHeartbeat();
        emitMarketRealtimeMetric({
          type: 'market.realtime.socket.closed',
          reason: isAuthenticationFailureCloseEvent(event) ? 'authentication-failure' : 'socket-close',
          code: typeof event?.code === 'number' ? event.code : null
        });
        if (isAuthenticationFailureCloseEvent(event)) {
          this.dispatch(logout());
          return;
        }
        this.scheduleReconnect({ reason: 'socket-close' });
      }
    });
  }

  refreshSubscription() {
    this.subscribeToTopics({ force: false });
  }

  private handleMessage(raw: string) {
    try {
      const payload: WebSocketEventPayload = JSON.parse(raw);
      this.log('parsed WebSocket payload', {
        type: payload.type,
        action: payload.action,
        event: payload.event ?? payload.topic ?? payload.channel,
        hasPayload:
          payload.payload != null || payload.data != null || (payload as SubscriptionAckPayload).snapshots != null
      });
      this.touchActivity();
      switch (payload.type) {
        case 'event':
          this.handleEvent(payload);
          break;
        case 'ack':
          void this.handleAck(payload);
          break;
        default:
          this.log('ignoring unsupported WebSocket message type', payload.type);
          break;
      }
    } catch (error) {
      this.warn('无法解析行情 WebSocket 消息：', raw, error);
    }
  }

  private async handleAck(payload: WebSocketEventPayload) {
    if (!payload.action) {
      return;
    }
    const ack = payload as SubscriptionAckPayload;
    this.log('processing WebSocket ACK', {
      action: ack.action,
      topics: ack.topics,
      symbol: ack.symbol,
      timeframe: ack.timeframe
    });
    switch (payload.action) {
      case 'subscribe':
        await this.handleSubscribeAck(ack);
        break;
      case 'unsubscribe':
        {
          const ackTopics = this.normalizeTopics(ack.topics);
          if (this.areTopicsEqual(ackTopics, this.lastSubscribedTopics)) {
            this.dispatch(resetMarketSubscription());
            this.log('subscription reset after unsubscribe ACK');
          } else {
            this.log('ignoring unsubscribe ACK for previous topics', ackTopics);
          }
        }
        break;
      default:
        this.log('ignoring ACK for unsupported action', payload.action);
        break;
    }
  }

  private async handleSubscribeAck(payload: SubscriptionAckPayload) {
    const topics = this.normalizeTopics(payload.topics);
    const symbol = this.normalizeOptionalString(payload.symbol);
    const timeframe = this.normalizeOptionalString(payload.timeframe);
    const subscriptionId = this.extractSubscriptionId(payload);
    const capabilities = this.extractCapabilities(payload);
    const errorMessage = this.extractAckError(payload);
    if (errorMessage) {
      this.warn('subscription ACK contained error', errorMessage);
      this.dispatch(
        setMarketSubscriptionFailed({
          error: errorMessage,
          symbol,
          timeframe
        })
      );
      this.updateConnectionStatus('failed', errorMessage);
      this.stopHeartbeat();
      this.clearReconnectTimer();
      this.socketHandle?.dispose();
      this.socketHandle = null;
      this.started = false;
      this.lastSubscribedSymbol = null;
      this.lastSubscribedTimeframe = null;
      this.lastRequestedSymbol = null;
      this.lastRequestedTimeframe = null;
      this.lastSubscriptionRequestedAt = null;
      this.lastSubscriptionCapabilities = null;
      this.lastCapabilitiesSymbol = null;
      emitMarketRealtimeMetric({
        type: 'market.realtime.subscribe.failed',
        symbol: symbol ?? null,
        timeframe: timeframe ?? null,
        error: errorMessage
      });
      return;
    }

    const effectiveSymbol = symbol ?? this.lastSubscribedSymbol;
    const effectiveTimeframe = timeframe ?? this.lastSubscribedTimeframe;

    if (symbol) {
      this.lastSubscribedSymbol = symbol;
    }
    if (timeframe) {
      this.lastSubscribedTimeframe = timeframe;
    }

    const resolvedTopics = Array.from(
      new Set(
        (topics.length
          ? topics
          : this.getDefaultTopics(effectiveSymbol ?? this.symbolProvider())
        )
          .filter((topic): topic is string => typeof topic === 'string')
          .map((topic) => topic.trim())
          .filter((topic) => Boolean(topic))
      )
    );

    this.dispatch(
      setMarketSubscriptionReady({
        id: subscriptionId,
        symbol: effectiveSymbol ?? null,
        timeframe: effectiveTimeframe ?? null,
        topics: resolvedTopics,
        capabilities
      })
    );
    const latency = this.lastSubscriptionRequestedAt != null ? Date.now() - this.lastSubscriptionRequestedAt : null;
    emitMarketRealtimeMetric({
      type: 'market.realtime.subscribe.ack',
      symbol: effectiveSymbol ?? null,
      timeframe: effectiveTimeframe ?? null,
      latencyMs: latency,
      capabilities: capabilities ?? null
    });
    this.lastSubscriptionRequestedAt = null;
    this.lastSubscribedTopics = resolvedTopics;
    this.log('subscription ready', {
      subscriptionId,
      topics: resolvedTopics,
      symbol: effectiveSymbol,
      timeframe: effectiveTimeframe,
      capabilities
    });

    if (capabilities) {
      const normalizedSymbol = (effectiveSymbol ?? this.symbolProvider() ?? '')
        .trim()
        .toUpperCase();
      this.lastSubscriptionCapabilities = capabilities;
      this.lastCapabilitiesSymbol = normalizedSymbol || null;
    } else {
      this.lastSubscriptionCapabilities = null;
      this.lastCapabilitiesSymbol = null;
    }

    const ackResult = this.ingestAckSnapshot(payload);

    const expectsDepth = this.shouldExpectDepthSnapshot(resolvedTopics, capabilities);
    const expectsBars = this.shouldExpectBarSnapshot(resolvedTopics, capabilities);
    if (expectsDepth && !ackResult.depthApplied && effectiveSymbol) {
      this.warn('订阅 ACK 缺少 DOM 快照，等待后续推送恢复', {
        capabilities,
        topics: resolvedTopics,
        symbol: effectiveSymbol
      });
    }
    if (expectsBars && !ackResult.historyApplied && !ackResult.barApplied && effectiveSymbol) {
      this.warn('订阅 ACK 缺少 K 线快照，等待后续推送恢复', {
        capabilities,
        topics: resolvedTopics,
        symbol: effectiveSymbol
      });
    }
  }

  private getDefaultTopics(rawSymbol?: string | null): string[] {
    const symbol = typeof rawSymbol === 'string' ? rawSymbol.trim() : '';
    const includeDom = this.shouldIncludeDomTopicsForSymbol(symbol || null);
    const uniqueTopics = Array.from(new Set(DEFAULT_SUBSCRIPTION_TOPICS)).filter((topic) =>
      DOM_TOPIC_BASE_SET.has(topic) ? includeDom : true
    );
    if (!symbol) {
      return uniqueTopics;
    }
    return uniqueTopics.map((topic) => `${topic}-${symbol}`);
  }

  private ingestAckSnapshot(payload: SubscriptionAckPayload): AckSnapshotResult {
    const snapshot = this.resolveAckSnapshot(payload);
    if (snapshot) {
      this.log('applying ACK snapshot', { keys: Object.keys(snapshot) });
    } else {
      this.log('ACK snapshot missing');
    }
    return this.applyAckSnapshot(snapshot);
  }

  private normalizeTopics(topics: unknown): string[] {
    if (!Array.isArray(topics)) {
      return [];
    }
    return topics
      .filter((item): item is string => typeof item === 'string')
      .map((item) => item.trim())
      .filter((item) => item.length > 0);
  }

  private normalizeOptionalString(value: unknown): string | null {
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed) {
        return trimmed;
      }
    }
    return null;
  }

  private extractSubscriptionId(payload: SubscriptionAckPayload): string | null {
    const candidates: unknown[] = [payload.subscriptionId, payload.subscription_id];
    if (this.isRecord(payload.metadata)) {
      const metadata = payload.metadata;
      candidates.push(metadata.subscriptionId);
      candidates.push(metadata.subscription_id);
      candidates.push(metadata.id);
      if (this.isRecord(metadata.subscription)) {
        const nested = metadata.subscription as Record<string, unknown>;
        candidates.push(nested.id);
        candidates.push(nested.subscriptionId);
        candidates.push(nested.subscription_id);
      }
    }
    if (this.isRecord(payload.snapshots)) {
      const snapshots = payload.snapshots as Record<string, unknown>;
      candidates.push(snapshots.subscriptionId);
      candidates.push(snapshots.subscription_id);
      candidates.push(snapshots.id);
      if (this.isRecord(snapshots.subscription)) {
        const nested = snapshots.subscription as Record<string, unknown>;
        candidates.push(nested.id);
        candidates.push(nested.subscriptionId);
        candidates.push(nested.subscription_id);
      }
    }
    if (this.isRecord(payload.payload)) {
      const nestedPayload = payload.payload as Record<string, unknown>;
      candidates.push(nestedPayload.subscriptionId);
      candidates.push(nestedPayload.subscription_id);
      candidates.push(nestedPayload.id);
      if (this.isRecord(nestedPayload.snapshots)) {
        const nestedSnapshots = nestedPayload.snapshots as Record<string, unknown>;
        candidates.push(nestedSnapshots.subscriptionId);
        candidates.push(nestedSnapshots.subscription_id);
        candidates.push(nestedSnapshots.id);
        if (this.isRecord(nestedSnapshots.subscription)) {
          const nested = nestedSnapshots.subscription as Record<string, unknown>;
          candidates.push(nested.id);
          candidates.push(nested.subscriptionId);
          candidates.push(nested.subscription_id);
        }
      }
    }
    for (const candidate of candidates) {
      if (typeof candidate === 'string') {
        const trimmed = candidate.trim();
        if (trimmed) {
          return trimmed;
        }
      }
    }
    return null;
  }

  private extractCapabilities(payload: SubscriptionAckPayload): Record<string, unknown> | null {
    if (this.isRecord(payload.capabilities)) {
      return payload.capabilities;
    }
    if (this.isRecord(payload.metadata)) {
      const metadata = payload.metadata as Record<string, unknown>;
      const candidate = metadata.capabilities;
      if (this.isRecord(candidate)) {
        return candidate;
      }
    }
    if (this.isRecord(payload.snapshots)) {
      const snapshots = payload.snapshots as Record<string, unknown>;
      const candidate = snapshots.capabilities;
      if (this.isRecord(candidate)) {
        return candidate;
      }
      if (this.isRecord(snapshots.subscription)) {
        const nested = snapshots.subscription as Record<string, unknown>;
        const nestedCandidate = nested.capabilities;
        if (this.isRecord(nestedCandidate)) {
          return nestedCandidate;
        }
      }
    }
    if (this.isRecord(payload.payload)) {
      const nestedPayload = payload.payload as Record<string, unknown>;
      const candidate = nestedPayload.capabilities;
      if (this.isRecord(candidate)) {
        return candidate;
      }
      if (this.isRecord(nestedPayload.snapshots)) {
        const nestedSnapshots = nestedPayload.snapshots as Record<string, unknown>;
        const nestedCandidate = nestedSnapshots.capabilities;
        if (this.isRecord(nestedCandidate)) {
          return nestedCandidate;
        }
        if (this.isRecord(nestedSnapshots.subscription)) {
          const nestedSubscription = nestedSnapshots.subscription as Record<string, unknown>;
          const subscriptionCandidate = nestedSubscription.capabilities;
          if (this.isRecord(subscriptionCandidate)) {
            return subscriptionCandidate;
          }
        }
      }
    }
    return null;
  }

  private extractAckError(payload: SubscriptionAckPayload): string | null {
    const normalize = (value: unknown): string | null => {
      if (typeof value === 'string') {
        const trimmed = value.trim();
        return trimmed ? trimmed : null;
      }
      if (this.isRecord(value)) {
        const recordValue = value as Record<string, unknown>;
        const keys = ['message', 'error', 'detail'];
        for (const key of keys) {
          if (key in recordValue) {
            const nested = normalize(recordValue[key]);
            if (nested) {
              return nested;
            }
          }
        }
      }
      return null;
    };

    const directError = normalize(payload.error);
    if (directError) {
      return directError;
    }
    if (this.isRecord(payload.payload)) {
      const nestedPayload = payload.payload as Record<string, unknown>;
      const nestedError = normalize(nestedPayload.error);
      if (nestedError) {
        return nestedError;
      }
    }
    if (payload.status === 'error' || payload.ok === false || payload.success === false) {
      if (typeof payload.message === 'string' && payload.message.trim()) {
        return payload.message.trim();
      }
      return '行情订阅创建失败';
    }
    return null;
  }

  private resolveAckSnapshot(payload: SubscriptionAckPayload): Record<string, unknown> | null {
    if (this.isRecord(payload.snapshot)) {
      return payload.snapshot as Record<string, unknown>;
    }
    if (this.isRecord(payload.snapshots)) {
      return payload.snapshots as Record<string, unknown>;
    }

    const candidates: unknown[] = [];

    if (this.isRecord(payload.payload)) {
      const nestedPayload = payload.payload as Record<string, unknown>;
      candidates.push(nestedPayload.snapshot);
      candidates.push(nestedPayload.snapshots);
      if (this.isRecord(nestedPayload.data)) {
        const nestedData = nestedPayload.data as Record<string, unknown>;
        candidates.push(nestedData.snapshot);
        candidates.push(nestedData.snapshots);
      }
    }

    if (this.isRecord(payload.data)) {
      const nestedData = payload.data as Record<string, unknown>;
      candidates.push(nestedData.snapshot);
      candidates.push(nestedData.snapshots);
    }

    if (Array.isArray(payload.snapshots)) {
      candidates.push(...payload.snapshots);
    }

    for (const candidate of candidates) {
      if (this.isRecord(candidate)) {
        return candidate as Record<string, unknown>;
      }
    }

    return null;
  }

  private applyAckSnapshot(snapshot: Record<string, unknown> | null): AckSnapshotResult {
    const result: AckSnapshotResult = {
      depthApplied: false,
      tickerApplied: false,
      barApplied: false,
      historyApplied: false
    };
    if (!snapshot) {
      return result;
    }
    const historicalContext = this.buildHistoricalBarsContext(snapshot);
    const depthValue = this.pickSnapshotValue(snapshot, [
      'market.dom',
      'market.depth',
      'depth',
      'dom',
      'depthSnapshot',
      'latest_dom',
      'latestDom'
    ]);
    if (depthValue !== undefined) {
      this.log('applying depth snapshot from ACK');
      this.handleDepthUpdate(depthValue);
      result.depthApplied = true;
    }
    const tickerValue = this.pickSnapshotValue(snapshot, [
      'market.ticker',
      'ticker',
      'tickerSnapshot',
      'latest_ticker',
      'latestTicker'
    ]);
    if (tickerValue !== undefined) {
      this.log('applying ticker snapshot from ACK');
      this.handleTickerUpdate(tickerValue);
      result.tickerApplied = true;
    }
    const historyValue = this.pickSnapshotValue(snapshot, ['historical_bars', 'historicalBars']);
    if (historyValue !== undefined) {
      this.log('applying historical bars snapshot from ACK');
      const applied = this.handleHistoricalBarsSnapshot(historyValue, { ...historicalContext });
      if (applied) {
        result.historyApplied = true;
      }
    }
    const barValue = this.pickSnapshotValue(snapshot, [
      'market.bar',
      'bar',
      'barSnapshot',
      'latestBar',
      'latest_bar'
    ]);
    if (barValue !== undefined) {
      if (!result.historyApplied) {
        this.log('promoting bar snapshot from ACK into historical context');
        const seeded = this.handleHistoricalBarsSnapshot(barValue, { ...historicalContext });
        if (seeded) {
          result.historyApplied = true;
        }
      }
      this.log('applying bar snapshot from ACK');
      this.handleBarUpdate(barValue);
      result.barApplied = true;
    }
    const klineValue = this.pickSnapshotValue(snapshot, ['kline', 'klineSnapshot', 'market.kline']);
    if (klineValue !== undefined) {
      this.log('applying kline snapshot from ACK');
      if (klineValue === null) {
        this.dispatch(setMarketKlineSnapshot(null));
      } else {
        const applied = this.handleHistoricalBarsSnapshot(klineValue, { ...historicalContext });
        if (applied) {
          result.historyApplied = true;
        } else {
          this.log('kline snapshot payload ignored after normalization');
        }
      }
    }
    const availabilityValue = this.pickSnapshotValue(snapshot, [
      'availability',
      'marketAvailability',
      'market.availability'
    ]);
    if (availabilityValue !== undefined) {
      this.log('applying availability snapshot from ACK');
      this.dispatch(setMarketAvailability(availabilityValue as MarketAvailability | null));
    }
    return result;
  }

  private pickSnapshotValue(snapshot: Record<string, unknown>, keys: string[]): unknown {
    const snapshotEntries = Object.entries(snapshot);
    for (const key of keys) {
      if (key in snapshot) {
        return snapshot[key];
      }
      const normalizedKey = typeof key === 'string' ? key.trim().toLowerCase() : '';
      if (!normalizedKey) {
        continue;
      }
      for (const [candidateKey, candidateValue] of snapshotEntries) {
        if (typeof candidateKey !== 'string') {
          continue;
        }
        const normalizedCandidate = candidateKey.trim().toLowerCase();
        if (!normalizedCandidate) {
          continue;
        }
        if (normalizedCandidate === normalizedKey) {
          return candidateValue;
        }
        if (
          normalizedCandidate.startsWith(`${normalizedKey}-`) ||
          normalizedCandidate.startsWith(`${normalizedKey}:`) ||
          normalizedCandidate.startsWith(`${normalizedKey}.`) ||
          normalizedCandidate.startsWith(`${normalizedKey}_`)
        ) {
          return candidateValue;
        }
      }
    }
    return undefined;
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  private coerceString(value: unknown): string | null {
    if (typeof value === 'string') {
      const trimmed = value.trim();
      return trimmed ? trimmed : null;
    }
    return null;
  }

  private coerceNumber(value: unknown): number | null {
    if (typeof value === 'number') {
      return Number.isFinite(value) ? value : null;
    }
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (!trimmed) {
        return null;
      }
      const parsed = Number(trimmed);
      return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
  }

  private applyHistoricalContextFromRecord(
    context: HistoricalBarsContext,
    record: Record<string, unknown>
  ) {
    const symbolCandidate = this.coerceString(record['symbol']);
    if (symbolCandidate && !context.symbol) {
      context.symbol = symbolCandidate;
    }
    const timeframeCandidate =
      this.coerceString(record['timeframe']) ?? this.coerceString(record['time_frame']);
    if (timeframeCandidate && !context.timeframe) {
      context.timeframe = timeframeCandidate;
    }
    const intervalCandidate =
      this.coerceNumber(record['interval_seconds']) ?? this.coerceNumber(record['intervalSeconds']);
    if (intervalCandidate !== null) {
      context.intervalSeconds = intervalCandidate;
    }
    const durationCandidate =
      this.coerceNumber(record['duration_seconds']) ??
      this.coerceNumber(record['durationSeconds']) ??
      this.coerceNumber(record['duration']);
    if (durationCandidate !== null) {
      context.durationSeconds = durationCandidate;
    }
  }

  private buildHistoricalBarsContext(snapshot: Record<string, unknown> | null): HistoricalBarsContext {
    const context: HistoricalBarsContext = {};
    if (snapshot) {
      this.applyHistoricalContextFromRecord(context, snapshot);
      const metadataCandidate = this.pickSnapshotValue(snapshot, ['metadata', 'context']);
      if (this.isRecord(metadataCandidate)) {
        this.applyHistoricalContextFromRecord(context, metadataCandidate as Record<string, unknown>);
      }
    }
    if (!context.symbol) {
      const symbol = this.symbolProvider();
      if (symbol) {
        context.symbol = symbol;
      }
    }
    if (!context.timeframe) {
      const timeframe = this.timeframeProvider();
      if (timeframe) {
        context.timeframe = timeframe;
      }
    }
    const aggregationWindow = resolveAggregationWindow(context.timeframe ?? this.timeframeProvider());
    if (!context.intervalSeconds) {
      context.intervalSeconds = aggregationWindow.intervalSeconds;
    }
    if (!context.durationSeconds) {
      const requestedDuration = this.durationProvider?.();
      context.durationSeconds = requestedDuration ?? aggregationWindow.durationSeconds;
    }
    return context;
  }

  private looksLikeBarRecord(record: Record<string, unknown>): boolean {
    return (
      typeof record['timestamp'] === 'string' &&
      (record['open'] !== undefined ||
        record['close'] !== undefined ||
        record['high'] !== undefined ||
        record['low'] !== undefined)
    );
  }

  private mapHistoricalBar(value: unknown): MarketBar | null {
    if (!this.isRecord(value)) {
      return null;
    }
    const record = value as Record<string, unknown>;
    const timestamp = normalizeTimestampToUtc(this.coerceString(record['timestamp']));
    if (!timestamp) {
      return null;
    }
    const open = this.coerceNumber(record['open']) ?? this.coerceNumber(record['close']) ?? 0;
    const high = this.coerceNumber(record['high']) ?? open;
    const low = this.coerceNumber(record['low']) ?? open;
    const close = this.coerceNumber(record['close']) ?? open;
    const volume = this.coerceNumber(record['volume']);
    return {
      timestamp,
      open,
      high: Math.max(high, open, close),
      low: Math.min(low, open, close),
      close,
      volume: volume ?? null
    };
  }

  private handleEvent(payload: WebSocketEventPayload) {
    const eventName = this.resolveEventName(payload);
    if (!eventName) {
      this.log('received event without recognizable name', payload);
      return;
    }
    const eventPayload = this.resolveEventPayload(payload);
    const descriptor = this.parseTopicDescriptor(eventName);
    const normalizedBase = descriptor.normalizedBaseTopic;
    const topicSymbol = descriptor.topicSymbol?.trim() ?? null;
    const payloadSymbol = this.extractPayloadSymbol(eventPayload);
    const selectedSymbolRaw = this.symbolProvider();
    const selectedSymbol = typeof selectedSymbolRaw === 'string' ? selectedSymbolRaw.trim() : '';
    const expectedSymbol = selectedSymbol || this.lastSubscribedSymbol || '';
    const normalizedSelectedSymbol = expectedSymbol ? expectedSymbol.toLowerCase() : null;
    const normalizedTopicSymbol = topicSymbol ? topicSymbol.toLowerCase() : null;
    const normalizedPayloadSymbol = payloadSymbol ? payloadSymbol.toLowerCase() : null;
    const selectedRoot = (() => {
      const root = extractRootSymbol(expectedSymbol);
      return root ? root.toLowerCase() : null;
    })();
    const topicRoot = (() => {
      const root = extractRootSymbol(topicSymbol ?? null);
      return root ? root.toLowerCase() : null;
    })();
    const payloadRoot = (() => {
      const root = extractRootSymbol(payloadSymbol ?? null);
      return root ? root.toLowerCase() : null;
    })();

    const hasSymbolMismatch = (() => {
      const matchesExpected = (normalizedSymbol: string | null, root: string | null) => {
        if (!normalizedSelectedSymbol) {
          return true;
        }
        if (normalizedSymbol === normalizedSelectedSymbol) {
          return true;
        }
        if (selectedRoot && root && root === selectedRoot) {
          return true;
        }
        return false;
      };

      if (
        normalizedTopicSymbol &&
        normalizedPayloadSymbol &&
        normalizedTopicSymbol !== normalizedPayloadSymbol
      ) {
        if (topicRoot && payloadRoot && topicRoot === payloadRoot) {
          return false;
        }
        if (selectedRoot && topicRoot === selectedRoot && payloadRoot === selectedRoot) {
          return false;
        }
        return true;
      }
      if (!matchesExpected(normalizedTopicSymbol, topicRoot)) {
        return true;
      }
      if (!matchesExpected(normalizedPayloadSymbol, payloadRoot)) {
        return true;
      }
      return false;
    })();

    if (hasSymbolMismatch) {
      const observedSymbols = new Set<string>();
      if (topicSymbol) {
        observedSymbols.add(topicSymbol);
      }
      if (payloadSymbol) {
        observedSymbols.add(payloadSymbol);
      }
      const observedSymbolText = observedSymbols.size
        ? Array.from(observedSymbols).join(' / ')
        : '未知';
      const expectedSymbolText = expectedSymbol || '当前订阅标的';
      const message = `收到标的 ${observedSymbolText} 的行情推送，与当前订阅 ${expectedSymbolText} 不符`;
      this.dispatch(addToast({ message, variant: 'error', preventDuplicates: true }));
      this.warn('ignoring event due to symbol mismatch', {
        event: eventName,
        topicSymbol,
        payloadSymbol,
        expectedSymbol: expectedSymbolText
      });
      return;
    }

    this.log('handling event', {
      event: eventName,
      topicSymbol,
      payloadSymbol: payloadSymbol ?? null
    });

    switch (normalizedBase) {
      case 'market.depth':
      case 'market.dom':
      case 'depth':
      case 'dom':
        this.handleDepthUpdate(eventPayload, descriptor.baseTopic, topicSymbol);
        break;
      case 'market.ticker':
      case 'ticker':
        this.handleTickerUpdate(eventPayload, descriptor.baseTopic, topicSymbol);
        break;
      case 'market.bar':
      case 'market.kline':
      case 'bar':
      case 'bars':
      case 'kline':
        this.handleBarUpdate(eventPayload, descriptor.baseTopic, topicSymbol);
        break;
      default:
        this.log('ignoring event for unsupported topic', eventName);
        break;
    }
  }

  private handleDepthUpdate(data: unknown, baseTopic?: string | null, topicSymbol?: string | null) {
    this.log('received depth payload', {
      data,
      baseTopic: baseTopic ?? null,
      topicSymbol: topicSymbol ?? null
    });
    const targetSymbol = this.symbolProvider();
    const snapshot = normalizeDepthPayload(data, targetSymbol);
    if (snapshot) {
      const targetRoot = extractRootSymbol(targetSymbol ?? null);
      const snapshotRoot = extractRootSymbol(snapshot.symbol ?? null);
      if (targetRoot && snapshotRoot && targetRoot !== snapshotRoot) {
        this.log('depth snapshot ignored due to root mismatch', {
          targetSymbol,
          snapshotSymbol: snapshot.symbol
        });
        return;
      }
      const normalizedSnapshot: DepthSnapshot = {
        ...snapshot,
        symbol:
          targetSymbol && snapshotRoot === targetRoot && snapshot.symbol !== targetSymbol
            ? targetSymbol
            : snapshot.symbol ?? targetSymbol ?? undefined
      };
      if (snapshot.symbol && normalizedSnapshot.symbol !== snapshot.symbol) {
        this.log('normalized depth snapshot symbol to match selection', {
          original: snapshot.symbol,
          normalized: normalizedSnapshot.symbol
        });
      }
      this.log('dispatching depth snapshot', normalizedSnapshot);
      this.dispatch(updateDepthSnapshot(normalizedSnapshot));
      const price = this.derivePriceFromDepth(normalizedSnapshot);
      const pricingSymbol = normalizedSnapshot.symbol ?? targetSymbol ?? null;
      if (pricingSymbol && price !== null) {
        this.dispatch(updatePositionPricing({ symbol: pricingSymbol, price }));
      }
    } else {
      this.log('depth payload ignored after normalization');
    }
  }

  private shouldExpectDepthSnapshot(
    topics: string[],
    capabilities: Record<string, unknown> | null
  ): boolean {
    const normalizedTopics = topics
      .map((topic) => this.parseTopicDescriptor(topic).normalizedBaseTopic)
      .filter((topic): topic is string => Boolean(topic));
    if (normalizedTopics.some((topic) => topic === 'market.dom' || topic === 'market.depth')) {
      return true;
    }
    if (!capabilities) {
      return false;
    }
    const truthy = (value: unknown): boolean => {
      if (typeof value === 'boolean') {
        return value;
      }
      if (typeof value === 'number') {
        return Number.isFinite(value) && value > 0;
      }
      if (typeof value === 'string') {
        const normalized = value.trim().toLowerCase();
        return normalized === 'true' || normalized === '1' || normalized === 'yes';
      }
      if (Array.isArray(value)) {
        return value.some((item) =>
          typeof item === 'string'
            ? item.toLowerCase() === 'market.dom' || item.toLowerCase() === 'market.depth'
            : false
        );
      }
      if (this.isRecord(value)) {
        const recordValue = value as Record<string, unknown>;
        const nestedKeys = [
          'market.dom',
          'market.depth',
          'dom',
          'depth',
          'enable_dom',
          'enable_depth',
          'has_dom',
          'has_depth',
          'supports_dom',
          'supports_depth',
          'topics'
        ];
        for (const key of nestedKeys) {
          if (key in recordValue && truthy(recordValue[key])) {
            return true;
          }
        }
      }
      return false;
    };
    for (const [key, value] of Object.entries(capabilities)) {
      const normalizedKey = key.toLowerCase();
      if (
        normalizedKey === 'market.dom' ||
        normalizedKey === 'market.depth' ||
        normalizedKey === 'dom' ||
        normalizedKey === 'depth' ||
        normalizedKey === 'enable_dom' ||
        normalizedKey === 'enable_depth' ||
        normalizedKey === 'has_dom' ||
        normalizedKey === 'has_depth' ||
        normalizedKey === 'supports_dom' ||
        normalizedKey === 'supports_depth'
      ) {
        if (truthy(value)) {
          return true;
        }
      }
    }
    return false;
  }

  private shouldExpectBarSnapshot(
    topics: string[],
    capabilities: Record<string, unknown> | null
  ): boolean {
    const normalizedTopics = topics
      .map((topic) => this.parseTopicDescriptor(topic).normalizedBaseTopic)
      .filter((topic): topic is string => Boolean(topic));
    if (
      normalizedTopics.some((topic) =>
        topic === 'market.bar' || topic === 'market.kline' || topic === 'bars' || topic === 'kline'
      )
    ) {
      return true;
    }
    if (!capabilities) {
      return false;
    }
    const truthy = (value: unknown): boolean => {
      if (typeof value === 'boolean') {
        return value;
      }
      if (typeof value === 'number') {
        return Number.isFinite(value) && value > 0;
      }
      if (typeof value === 'string') {
        const normalized = value.trim().toLowerCase();
        return normalized === 'true' || normalized === '1' || normalized === 'yes';
      }
      if (Array.isArray(value)) {
        return value.some((item) =>
          typeof item === 'string'
            ? item.toLowerCase() === 'market.bar' ||
              item.toLowerCase() === 'market.kline' ||
              item.toLowerCase() === 'bars' ||
              item.toLowerCase() === 'kline'
            : false
        );
      }
      if (this.isRecord(value)) {
        const recordValue = value as Record<string, unknown>;
        const nestedKeys = [
          'market.bar',
          'market.kline',
          'bar',
          'bars',
          'kline',
          'historical_bars',
          'historicalBars',
          'enable_bars',
          'enable_bar',
          'has_bars',
          'has_bar',
          'supports_bars',
          'supports_bar',
          'topics'
        ];
        for (const key of nestedKeys) {
          if (key in recordValue && truthy(recordValue[key])) {
            return true;
          }
        }
      }
      return false;
    };
    for (const [key, value] of Object.entries(capabilities)) {
      const normalizedKey = key.toLowerCase();
      if (
        normalizedKey === 'market.bar' ||
        normalizedKey === 'market.kline' ||
        normalizedKey === 'bar' ||
        normalizedKey === 'bars' ||
        normalizedKey === 'kline' ||
        normalizedKey === 'historical_bars' ||
        normalizedKey === 'enable_bars' ||
        normalizedKey === 'has_bars' ||
        normalizedKey === 'supports_bars'
      ) {
        if (truthy(value)) {
          return true;
        }
      }
    }
    return false;
  }

  private handleTickerUpdate(data: unknown, baseTopic?: string | null, topicSymbol?: string | null) {
    this.log('received ticker payload', {
      data,
      baseTopic: baseTopic ?? null,
      topicSymbol: topicSymbol ?? null
    });
    const targetSymbol = this.symbolProvider();
    const ticker = normalizeTickerPayload(data, targetSymbol);
    if (ticker) {
      const normalizedTicker = this.normalizeTickerSnapshot(ticker, targetSymbol);
      this.log('dispatching ticker snapshot', normalizedTicker);
      this.dispatch(setTickerSnapshot(normalizedTicker));
      const price = this.derivePriceFromTicker(normalizedTicker);
      const pricingSymbol = normalizedTicker.symbol ?? ticker.symbol ?? targetSymbol ?? null;
      if (pricingSymbol && price !== null) {
        this.dispatch(updatePositionPricing({ symbol: pricingSymbol, price }));
      }
    } else {
      this.log('ticker payload ignored after normalization');
    }
  }

  private derivePriceFromDepth(snapshot: DepthSnapshot): number | null {
    const mid = this.pickFirstFinite(snapshot.midPrice);
    const symbol = snapshot.symbol ?? this.symbolProvider();
    if (mid !== null) {
      const normalizedMid = this.normalizeRealtimePrice(symbol ?? null, mid, snapshot.midPrice ?? mid);
      if (normalizedMid !== null) {
        return normalizedMid;
      }
    }
    const bestBid = snapshot.bids?.[0]?.price;
    const bestAsk = snapshot.asks?.[0]?.price;
    let candidate: number | null = null;
    if (isFiniteNumber(bestBid) && isFiniteNumber(bestAsk)) {
      candidate = Number(((bestBid + bestAsk) / 2).toFixed(6));
    } else if (isFiniteNumber(bestBid)) {
      candidate = bestBid;
    } else if (isFiniteNumber(bestAsk)) {
      candidate = bestAsk;
    }
    if (candidate === null) {
      return null;
    }
    return this.normalizeRealtimePrice(symbol ?? null, candidate, mid ?? snapshot.midPrice ?? candidate);
  }

  private derivePriceFromTicker(ticker: MarketTickerSnapshot): number | null {
    const bidAskMid =
      isFiniteNumber(ticker.bid) && isFiniteNumber(ticker.ask)
        ? Number(((ticker.bid + ticker.ask) / 2).toFixed(4))
        : null;
    const candidate = this.pickFirstFinite(ticker.last, ticker.midPrice, ticker.close, bidAskMid);
    if (candidate === null) {
      return null;
    }
    return this.normalizeRealtimePrice(ticker.symbol ?? this.symbolProvider(), candidate, ticker.close ?? ticker.midPrice ?? candidate);
  }

  private pickFirstFinite(...values: Array<number | null | undefined>): number | null {
    for (const value of values) {
      if (isFiniteNumber(value)) {
        return value;
      }
    }
    return null;
  }

  private handleBarUpdate(data: unknown, baseTopic?: string | null, topicSymbol?: string | null) {
    this.log('received bar payload', {
      data,
      baseTopic: baseTopic ?? null,
      topicSymbol: topicSymbol ?? null
    });
    const symbol = this.symbolProvider();
    const timeframe = this.timeframeProvider();
    const window = resolveAggregationWindow(timeframe ?? null);
    const requestedDuration = this.durationProvider?.() ?? null;
    const normalized = normalizeBarEventPayload(data, {
      symbol,
      timeframe,
      intervalSeconds: window.intervalSeconds,
      durationSeconds: requestedDuration ?? window.durationSeconds
    });
    if (!normalized) {
      this.log('bar payload ignored after normalization');
      return;
    }
    if (normalized.snapshot) {
      this.log('dispatching kline snapshot from bar payload', normalized.snapshot);
      this.dispatch(setMarketKlineSnapshot(normalized.snapshot));
    }
    if (normalized.bar) {
      this.log('dispatching incremental bar update', normalized.bar);
      this.dispatch(
        upsertMarketBar({
          bar: normalized.bar,
          symbol: normalized.symbol ?? symbol,
          timeframe: normalized.timeframe ?? timeframe,
          intervalSeconds: normalized.intervalSeconds,
          durationSeconds: normalized.durationSeconds
        })
      );
    }
  }

  private collectHistoricalBars(
    data: unknown,
    baseContext?: HistoricalBarsContext
  ): { bars: MarketBar[]; context: HistoricalBarsContext } | null {
    const context: HistoricalBarsContext = { ...baseContext };
    const candidates: unknown[] = [];

    const enqueueFromRecord = (record: Record<string, unknown>) => {
      this.applyHistoricalContextFromRecord(context, record);
      const arrayCandidates = [
        record['historical_bars'],
        record['historicalBars'],
        record['bars'],
        record['items']
      ];
      for (const arrayCandidate of arrayCandidates) {
        if (Array.isArray(arrayCandidate)) {
          candidates.push(...arrayCandidate);
        }
      }
      const singleCandidates = [
        record['bar'],
        record['latest_bar'],
        record['latestBar'],
        record['snapshot']
      ];
      for (const singleCandidate of singleCandidates) {
        if (this.isRecord(singleCandidate)) {
          candidates.push(singleCandidate);
        }
      }
      if (!arrayCandidates.some((item) => Array.isArray(item)) && !singleCandidates.some((item) => this.isRecord(item))) {
        if (this.looksLikeBarRecord(record)) {
          candidates.push(record);
        }
      }
      const metadataCandidate = record['metadata'];
      if (this.isRecord(metadataCandidate)) {
        this.applyHistoricalContextFromRecord(context, metadataCandidate as Record<string, unknown>);
        const metadataRecord = metadataCandidate as Record<string, unknown>;
        if (Array.isArray(metadataRecord['bars'])) {
          candidates.push(...(metadataRecord['bars'] as unknown[]));
        }
        if (this.isRecord(metadataRecord['bar'])) {
          candidates.push(metadataRecord['bar'] as Record<string, unknown>);
        }
      }
    };

    if (Array.isArray(data)) {
      candidates.push(...data);
    } else if (this.isRecord(data)) {
      enqueueFromRecord(data);
    } else {
      return null;
    }

    if (!candidates.length) {
      this.log('no bar candidates discovered in historical payload');
      return null;
    }

    const normalizedBars = candidates
      .map((item) => this.mapHistoricalBar(item))
      .filter((bar): bar is MarketBar => Boolean(bar));

    if (!normalizedBars.length) {
      this.log('no valid historical bars extracted');
      return null;
    }

    const merged = new Map<string, MarketBar>();
    for (const bar of normalizedBars) {
      merged.set(bar.timestamp, bar);
    }
    const orderedBars = Array.from(merged.values()).sort(
      (left, right) => Date.parse(left.timestamp) - Date.parse(right.timestamp)
    );

    return { bars: orderedBars, context };
  }

  private handleHistoricalBarsSnapshot(
    data: unknown,
    baseContext?: HistoricalBarsContext
  ): boolean {
    this.log('received historical bars payload', { data, baseContext });
    const collected = this.collectHistoricalBars(data, baseContext);
    if (!collected) {
      this.log('historical bars payload empty or invalid');
      return false;
    }

    const { bars, context } = collected;

    const timeframe = context.timeframe ?? this.timeframeProvider();
    const window = resolveAggregationWindow(timeframe ?? null);
    const intervalSeconds = context.intervalSeconds ?? window.intervalSeconds;
    const durationSeconds =
      context.durationSeconds ?? this.durationProvider?.() ?? window.durationSeconds;
    const symbol = context.symbol ?? this.symbolProvider() ?? '';

    this.log('dispatching historical bars snapshot', {
      count: bars.length,
      symbol,
      timeframe
    });

    this.dispatch(
      setMarketKlineSnapshot({
        symbol,
        timeframe: timeframe ?? '',
        intervalSeconds,
        durationSeconds,
        bars,
        end: bars[bars.length - 1]?.timestamp ?? null
      })
    );
    return true;
  }

  private send(message: Record<string, unknown>): boolean {
    return this.socketHandle?.send(message) ?? false;
  }

  private unsubscribeFromTopics(topics: string[]) {
    const normalized = this.normalizeTopics(topics);
    if (!normalized.length) {
      return;
    }
    const sent = this.send({
      action: 'unsubscribe',
      topics: normalized
    });
    if (sent) {
      this.log('unsubscribe request sent', { topics: normalized });
    } else {
      this.warn('failed to send unsubscribe request', normalized);
    }
  }

  private areTopicsEqual(left: string[] | null | undefined, right: string[] | null | undefined): boolean {
    const leftSet = new Set(this.normalizeTopics(left ?? []));
    const rightSet = new Set(this.normalizeTopics(right ?? []));
    if (leftSet.size !== rightSet.size) {
      return false;
    }
    for (const topic of leftSet) {
      if (!rightSet.has(topic)) {
        return false;
      }
    }
    return true;
  }

  private subscribeToTopics({ force }: { force: boolean }) {
    const handle = this.socketHandle;
    if (!handle?.isOpen()) {
      this.log('cannot subscribe to topics because WebSocket is not open');
      return;
    }

    const rawSymbol = this.symbolProvider();
    const symbol = typeof rawSymbol === 'string' ? rawSymbol.trim() : '';
    if (!symbol) {
      return;
    }
    const topics = this.getDefaultTopics(symbol);
    if (!topics.length) {
      this.log('no topics available for subscription');
      return;
    }
    const normalizedSymbol = symbol || null;
    const rawTimeframe = this.timeframeProvider();
    const timeframe = typeof rawTimeframe === 'string' ? rawTimeframe.trim() : '';
    const normalizedTimeframe = timeframe || null;

    const shouldUnsubscribePrevious =
      this.lastSubscribedSymbol != null &&
      (normalizedSymbol !== this.lastSubscribedSymbol ||
        normalizedTimeframe !== this.lastSubscribedTimeframe);

    if (
      !force &&
      normalizedSymbol === this.lastRequestedSymbol &&
      normalizedTimeframe === this.lastRequestedTimeframe
    ) {
      this.log('subscription skipped because symbol/timeframe unchanged');
      return;
    }

    if (shouldUnsubscribePrevious) {
      this.unsubscribeFromTopics(this.lastSubscribedTopics);
    }

    const payload: Record<string, unknown> = {
      action: 'subscribe',
      topics
    };
    if (normalizedSymbol) {
      payload.symbol = normalizedSymbol;
    }
    if (normalizedTimeframe) {
      payload.timeframe = normalizedTimeframe;
    }

    const sent = handle.send(payload);
    if (sent) {
      this.log('subscription request sent', { symbol: normalizedSymbol, timeframe: normalizedTimeframe, topics });
      this.dispatch(
        setMarketSubscriptionPending({
          symbol: normalizedSymbol,
          timeframe: normalizedTimeframe,
          topics
        })
      );
      emitMarketRealtimeMetric({
        type: 'market.realtime.subscribe.requested',
        symbol: normalizedSymbol,
        timeframe: normalizedTimeframe,
        topics
      });
      this.lastRequestedSymbol = normalizedSymbol;
      this.lastRequestedTimeframe = normalizedTimeframe;
      this.lastSubscribedSymbol = normalizedSymbol;
      this.lastSubscribedTimeframe = normalizedTimeframe;
      this.lastSubscribedTopics = topics;
      this.lastSubscriptionRequestedAt = Date.now();
    } else {
      this.warn('failed to send subscription request');
    }
  }

  private resolveEventName(payload: WebSocketEventPayload): string | null {
    const candidates = [payload.event, payload.topic, payload.channel];
    for (const candidate of candidates) {
      if (typeof candidate === 'string') {
        const trimmed = candidate.trim();
        if (trimmed) {
          return trimmed;
        }
      }
    }
    return null;
  }

  private resolveEventPayload(payload: WebSocketEventPayload): unknown {
    if ('payload' in payload) {
      return payload.payload;
    }
    if ('data' in payload) {
      return payload.data;
    }
    return undefined;
  }

  private parseTopicDescriptor(topicName: string | null | undefined): {
    baseTopic: string;
    normalizedBaseTopic: string;
    topicSymbol: string | null;
  } {
    if (typeof topicName !== 'string') {
      return { baseTopic: '', normalizedBaseTopic: '', topicSymbol: null };
    }
    const trimmed = topicName.trim();
    if (!trimmed) {
      return { baseTopic: '', normalizedBaseTopic: '', topicSymbol: null };
    }
    const lower = trimmed.toLowerCase();
    for (const base of KNOWN_TOPIC_BASES) {
      const baseLower = base.toLowerCase();
      if (lower === baseLower) {
        return { baseTopic: base, normalizedBaseTopic: baseLower, topicSymbol: null };
      }
      const prefix = `${baseLower}-`;
      if (lower.startsWith(prefix)) {
        const suffix = trimmed.slice(base.length + 1);
        return {
          baseTopic: base,
          normalizedBaseTopic: baseLower,
          topicSymbol: suffix ? suffix.trim() : null
        };
      }
    }
    const hyphenIndex = trimmed.indexOf('-');
    if (hyphenIndex > 0 && hyphenIndex < trimmed.length - 1) {
      const baseTopic = trimmed.slice(0, hyphenIndex);
      const symbol = trimmed.slice(hyphenIndex + 1);
      return {
        baseTopic,
        normalizedBaseTopic: baseTopic.toLowerCase(),
        topicSymbol: symbol ? symbol.trim() : null
      };
    }
    return { baseTopic: trimmed, normalizedBaseTopic: lower, topicSymbol: null };
  }

  private extractPayloadSymbol(value: unknown): string | null {
    if (!this.isRecord(value)) {
      return null;
    }
    const record = value as Record<string, unknown>;
    const direct = this.coerceString(record['symbol']);
    if (direct) {
      return direct;
    }
    if (this.isRecord(record['payload'])) {
      const nested = this.coerceString((record['payload'] as Record<string, unknown>)['symbol']);
      if (nested) {
        return nested;
      }
    }
    if (this.isRecord(record['data'])) {
      const nested = this.coerceString((record['data'] as Record<string, unknown>)['symbol']);
      if (nested) {
        return nested;
      }
    }
    return null;
  }

  private log(message: string, ...args: unknown[]) {
    if (!DEBUG_LOGGING_ENABLED) {
      return;
    }
    if (typeof console !== 'undefined' && typeof console.info === 'function') {
      console.info(`${LOG_PREFIX} ${message}`, ...args);
    }
  }

  private warn(message?: unknown, ...args: unknown[]) {
    if (typeof console !== 'undefined' && typeof console.warn === 'function') {
      console.warn(`${LOG_PREFIX} ${String(message ?? '')}`, ...args);
    }
  }
}
