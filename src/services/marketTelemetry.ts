import type { MarketConnectionStatus } from '@features/dashboard/types';

export type MarketRealtimeMetricEvent =
  | {
      type: 'market.realtime.connection_status';
      status: MarketConnectionStatus;
      error?: string | null;
    }
  | {
      type: 'market.realtime.subscribe.requested';
      symbol: string | null;
      timeframe: string | null;
      topics: string[];
    }
  | {
      type: 'market.realtime.subscribe.ack';
      symbol: string | null;
      timeframe: string | null;
      latencyMs: number | null;
      capabilities?: Record<string, unknown> | null;
    }
  | {
      type: 'market.realtime.subscribe.failed';
      symbol: string | null;
      timeframe: string | null;
      error: string;
    }
  | {
      type: 'market.realtime.reconnect_scheduled';
      attempt: number;
      delayMs: number;
      reason: string;
    }
  | {
      type: 'market.realtime.heartbeat_timeout';
      inactivityMs: number;
      symbol: string | null;
      timeframe: string | null;
      topics: string[];
    }
  | {
      type: 'market.realtime.socket.opened';
      attempt: number;
      latencyMs: number | null;
    }
  | {
      type: 'market.realtime.socket.closed';
      reason: string;
      code?: number | null;
    }
  | {
      type: 'market.realtime.socket.error';
      reason: string;
    };

export type MarketRealtimeMetricListener = (event: MarketRealtimeMetricEvent) => void;

interface TelemetrySink {
  track: (event: MarketRealtimeMetricEvent) => void;
}

interface TelemetryContext extends EventTarget {
  __APP_MARKET_METRICS__?: TelemetrySink;
}

const runtimeContext: TelemetryContext = (() => {
  if (typeof window !== 'undefined') {
    return window as unknown as TelemetryContext;
  }
  if (typeof globalThis !== 'undefined') {
    const context = globalThis as TelemetryContext;
    if (typeof context.addEventListener !== 'function') {
      const target = typeof EventTarget !== 'undefined' ? new EventTarget() : (null as unknown as EventTarget);
      return Object.assign(target, context);
    }
    return context;
  }
  return new EventTarget() as TelemetryContext;
})();

const fallbackTarget =
  typeof runtimeContext.dispatchEvent === 'function' && typeof runtimeContext.addEventListener === 'function'
    ? runtimeContext
    : new EventTarget();

export const MARKET_REALTIME_EVENT_NAME = 'algo-trader:market-realtime-metric';

const listeners = new Set<MarketRealtimeMetricListener>();

const emitToSink = (event: MarketRealtimeMetricEvent) => {
  const sink = runtimeContext.__APP_MARKET_METRICS__;
  if (!sink || typeof sink.track !== 'function') {
    return;
  }
  try {
    sink.track(event);
  } catch (error) {
    if (typeof console !== 'undefined' && typeof console.warn === 'function') {
      console.warn('[MarketTelemetry] sink.track failed', error);
    }
  }
};

const emitToEventTarget = (event: MarketRealtimeMetricEvent) => {
  if (!fallbackTarget || typeof fallbackTarget.dispatchEvent !== 'function') {
    return;
  }
  try {
    if (typeof CustomEvent === 'function') {
      const customEvent = new CustomEvent(MARKET_REALTIME_EVENT_NAME, { detail: event });
      fallbackTarget.dispatchEvent(customEvent);
      return;
    }
    const basicEvent = new Event(MARKET_REALTIME_EVENT_NAME) as Event & { detail?: MarketRealtimeMetricEvent };
    basicEvent.detail = event;
    fallbackTarget.dispatchEvent(basicEvent);
  } catch (error) {
    if (typeof console !== 'undefined' && typeof console.warn === 'function') {
      console.warn('[MarketTelemetry] dispatchEvent failed', error);
    }
  }
};

export const subscribeMarketRealtimeMetrics = (listener: MarketRealtimeMetricListener) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export const emitMarketRealtimeMetric = (event: MarketRealtimeMetricEvent) => {
  for (const listener of listeners) {
    try {
      listener(event);
    } catch (error) {
      if (typeof console !== 'undefined' && typeof console.warn === 'function') {
        console.warn('[MarketTelemetry] listener error', error);
      }
    }
  }
  emitToSink(event);
  emitToEventTarget(event);
};

export const getTelemetryEventTarget = () => fallbackTarget;
