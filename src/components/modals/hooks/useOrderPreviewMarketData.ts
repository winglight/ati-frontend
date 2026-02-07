import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from 'react-redux';
import { useAppSelector } from '@store/hooks';
import type { RootState } from '@store/index';
import type { MarketBar } from '@features/dashboard/types';
import { loadMarketSnapshot, dedupeMarketBars } from '@services/marketApi';
import { normalizeTickerPayload, normalizeBarEventPayload } from '@services/marketNormalization';
import { subscribeWebSocket, type WebSocketSubscription } from '@services/websocketHub';

interface WebSocketEnvelope {
  type?: string;
  event?: string;
  topic?: string;
  channel?: string;
  payload?: unknown;
  data?: unknown;
  message?: unknown;
  snapshots?: unknown;
  [key: string]: unknown;
}

interface OrderPreviewMarketDataState {
  currentPrice: number | null;
  bars: MarketBar[];
  loading: boolean;
  error: string | null;
}

const SNAPSHOT_TIMEFRAME = '1m';
const SNAPSHOT_INTERVAL_SECONDS = 60;
const SNAPSHOT_DURATION_SECONDS = 30 * 60;
const MAX_BAR_POINTS = 120;

const KNOWN_BAR_KEYS = ['market.bar', 'bar', 'market.kline', 'kline', 'bars'];
const KNOWN_TICKER_KEYS = ['market.ticker', 'ticker'];

const toLower = (value: string | null | undefined) =>
  typeof value === 'string' ? value.trim().toLowerCase() : '';

const coerceRecord = (value: unknown): Record<string, unknown> | null => {
  if (!value || typeof value !== 'object') {
    return null;
  }
  return value as Record<string, unknown>;
};

const resolveEventPayload = (payload: WebSocketEnvelope): unknown => {
  if ('payload' in payload) {
    return payload.payload;
  }
  if ('data' in payload) {
    return payload.data;
  }
  return undefined;
};

const extractAckSnapshots = (payload: WebSocketEnvelope): Record<string, unknown> | null => {
  const direct = coerceRecord(payload.snapshots);
  if (direct) {
    return direct;
  }
  const nestedPayload = coerceRecord(payload.payload);
  if (nestedPayload) {
    const nestedSnapshots = coerceRecord(nestedPayload.snapshots);
    if (nestedSnapshots) {
      return nestedSnapshots;
    }
  }
  return null;
};

const parseTopicDescriptor = (
  topicName: string | null | undefined
): { baseTopic: string; normalizedBaseTopic: string; topicSymbol: string | null } => {
  if (typeof topicName !== 'string') {
    return { baseTopic: '', normalizedBaseTopic: '', topicSymbol: null };
  }
  const trimmed = topicName.trim();
  if (!trimmed) {
    return { baseTopic: '', normalizedBaseTopic: '', topicSymbol: null };
  }
  const lower = trimmed.toLowerCase();
  for (const base of [...KNOWN_TICKER_KEYS, ...KNOWN_BAR_KEYS]) {
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
};

const barsAreEqual = (left: MarketBar | undefined, right: MarketBar | undefined): boolean => {
  if (!left || !right) {
    return false;
  }
  return (
    left.open === right.open &&
    left.high === right.high &&
    left.low === right.low &&
    left.close === right.close &&
    (left.volume ?? null) === (right.volume ?? null)
  );
};

const limitBars = (collection: MarketBar[]): MarketBar[] => {
  if (!Number.isFinite(MAX_BAR_POINTS) || collection.length <= MAX_BAR_POINTS) {
    return collection;
  }
  return collection.slice(collection.length - MAX_BAR_POINTS);
};

const mergeBars = (current: MarketBar[], update: MarketBar): MarketBar[] => {
  if (!update || typeof update.timestamp !== 'string') {
    return current;
  }
  const existingIndex = current.findIndex((item) => item.timestamp === update.timestamp);
  if (existingIndex >= 0) {
    const existing = current[existingIndex];
    if (barsAreEqual(existing, update)) {
      return current;
    }
    const next = current.slice();
    next[existingIndex] = update;
    return limitBars(next);
  }
  const next = [...current, update];
  next.sort((left, right) => Date.parse(left.timestamp) - Date.parse(right.timestamp));
  return limitBars(next);
};

const mergeBarCollection = (current: MarketBar[], updates: MarketBar[]): MarketBar[] => {
  if (!Array.isArray(updates) || updates.length === 0) {
    return current;
  }
  let result = current;
  for (const bar of updates) {
    const next = mergeBars(result, bar);
    if (next !== result) {
      result = next;
    }
  }
  return result;
};

const extractFinitePrice = (candidateList: Array<number | null | undefined>): number | null => {
  for (const candidate of candidateList) {
    if (typeof candidate === 'number' && Number.isFinite(candidate)) {
      return candidate;
    }
  }
  return null;
};

export default function useOrderPreviewMarketData(symbol: string, open: boolean) {
  const store = useStore<RootState>();
  const token = useAppSelector((state) => state.auth.token);
  const clientId = useAppSelector((state) => state.realtime.clientId);
  const [state, setState] = useState<OrderPreviewMarketDataState>({
    currentPrice: null,
    bars: [],
    loading: false,
    error: null
  });

  const subscriptionRef = useRef<WebSocketSubscription | null>(null);
  const lastTopicsRef = useRef<string[] | null>(null);
  const previousSymbolRef = useRef<string | null>(null);

  const resetState = useCallback(() => {
    setState({ currentPrice: null, bars: [], loading: false, error: null });
  }, []);

  const clearSubscription = useCallback(() => {
    const handle = subscriptionRef.current;
    if (handle) {
      if (lastTopicsRef.current?.length) {
        handle.send({ action: 'unsubscribe', topics: lastTopicsRef.current });
      }
      handle.dispose();
      subscriptionRef.current = null;
    }
    lastTopicsRef.current = null;
  }, []);

  useEffect(() => {
    if (!open) {
      clearSubscription();
      resetState();
      previousSymbolRef.current = null;
      return;
    }
    const trimmedSymbol = typeof symbol === 'string' ? symbol.trim() : '';
    if (!trimmedSymbol) {
      resetState();
      previousSymbolRef.current = null;
      return;
    }
    if (previousSymbolRef.current && previousSymbolRef.current !== trimmedSymbol) {
      resetState();
    }
    previousSymbolRef.current = trimmedSymbol;
    if (!token) {
      setState((previous) => ({ ...previous, error: '缺少行情访问令牌', loading: false }));
      return;
    }

    let cancelled = false;
    setState((previous) => ({ ...previous, loading: true, error: null }));

    void loadMarketSnapshot(token, {
      symbol: trimmedSymbol,
      timeframe: SNAPSHOT_TIMEFRAME,
      intervalSeconds: SNAPSHOT_INTERVAL_SECONDS,
      durationSeconds: SNAPSHOT_DURATION_SECONDS,
      ownerId: clientId ? `ws:${clientId}` : undefined
    })
      .then((snapshot) => {
        if (cancelled) {
          return;
        }
        const nextBars = snapshot.kline?.bars
          ? limitBars(dedupeMarketBars(snapshot.kline.bars))
          : [];
        const ticker = snapshot.ticker;
        const derivedPrice = extractFinitePrice([
          ticker?.last,
          ticker?.midPrice,
          ticker?.close,
          ticker?.bid,
          ticker?.ask,
          nextBars.length ? nextBars[nextBars.length - 1]?.close : null
        ]);
        setState({
          currentPrice: derivedPrice,
          bars: nextBars,
          loading: false,
          error: null
        });
      })
      .catch((error: unknown) => {
        if (cancelled) {
          return;
        }
        const message = error instanceof Error ? error.message : '获取行情快照失败';
        setState((previous) => ({ ...previous, loading: false, error: message }));
      });

    return () => {
      cancelled = true;
    };
  }, [clearSubscription, open, resetState, symbol, token, clientId]);

  useEffect(() => {
    if (!open) {
      clearSubscription();
      return;
    }
    const trimmedSymbol = typeof symbol === 'string' ? symbol.trim() : '';
    if (!trimmedSymbol) {
      clearSubscription();
      return;
    }
    if (!token) {
      clearSubscription();
      return;
    }

    clearSubscription();

    const topics = [`market.ticker-${trimmedSymbol}`, `market.bar-${trimmedSymbol}`];
    lastTopicsRef.current = topics;

    let disposed = false;
    const handle = subscribeWebSocket({
      name: 'order-entry-market-preview',
      tokenProvider: () => store.getState().auth.token,
      onOpen: () => {
        if (disposed) {
          return;
        }
        handle.send({ action: 'subscribe', topics, symbol: trimmedSymbol, timeframe: SNAPSHOT_TIMEFRAME });
      },
      onMessage: (raw) => {
        let envelope: WebSocketEnvelope;
        try {
          envelope = JSON.parse(raw) as WebSocketEnvelope;
        } catch (error) {
          console.warn('无法解析行情推送：', raw, error);
          return;
        }
        if (envelope.type === 'error') {
          const message =
            typeof envelope.message === 'string' && envelope.message
              ? envelope.message
              : '行情推送出现错误';
          setState((previous) => ({ ...previous, error: message }));
          return;
        }
        if (envelope.type === 'ack') {
          const snapshots = extractAckSnapshots(envelope);
          if (snapshots) {
            const tickerSnapshot = KNOWN_TICKER_KEYS.map((key) => coerceRecord(snapshots[key]))
              .filter((value): value is Record<string, unknown> => Boolean(value))[0];
            if (tickerSnapshot) {
              const ticker = normalizeTickerPayload(tickerSnapshot, trimmedSymbol);
              if (ticker) {
                const price = extractFinitePrice([
                  ticker.last,
                  ticker.midPrice,
                  ticker.close,
                  ticker.bid,
                  ticker.ask
                ]);
                if (price !== null) {
                  setState((previous) => ({ ...previous, currentPrice: price }));
                }
              }
            }
            const barSnapshot = KNOWN_BAR_KEYS.map((key) => coerceRecord(snapshots[key]))
              .filter((value): value is Record<string, unknown> => Boolean(value))[0];
            if (barSnapshot) {
              const normalized = normalizeBarEventPayload(barSnapshot, {
                symbol: trimmedSymbol,
                timeframe: SNAPSHOT_TIMEFRAME,
                intervalSeconds: SNAPSHOT_INTERVAL_SECONDS,
                durationSeconds: SNAPSHOT_DURATION_SECONDS
              });
              if (normalized?.snapshot?.bars?.length) {
                const deduped = limitBars(dedupeMarketBars(normalized.snapshot.bars));
                setState((previous) => {
                  const merged = mergeBarCollection(previous.bars, deduped);
                  const lastClose = deduped[deduped.length - 1]?.close ?? null;
                  const nextPrice =
                    typeof lastClose === 'number' && Number.isFinite(lastClose)
                      ? lastClose
                      : previous.currentPrice;
                  if (merged === previous.bars && nextPrice === previous.currentPrice) {
                    return previous;
                  }
                  return {
                    ...previous,
                    bars: merged,
                    currentPrice: nextPrice
                  };
                });
              }
            }
          }
          return;
        }
        if (envelope.type !== 'event') {
          return;
        }
        const descriptor = parseTopicDescriptor(
          envelope.topic ?? envelope.event ?? envelope.channel ?? null
        );
        const payload = resolveEventPayload(envelope);
        const targetSymbolLower = toLower(trimmedSymbol);
        const descriptorSymbolLower = toLower(descriptor.topicSymbol);
        if (descriptorSymbolLower && descriptorSymbolLower !== targetSymbolLower) {
          return;
        }
        const normalizedBase = descriptor.normalizedBaseTopic;
        if (KNOWN_TICKER_KEYS.some((key) => key.toLowerCase() === normalizedBase)) {
          const ticker = normalizeTickerPayload(payload, trimmedSymbol);
          if (ticker) {
            const price = extractFinitePrice([
              ticker.last,
              ticker.midPrice,
              ticker.close,
              ticker.bid,
              ticker.ask
            ]);
            if (price !== null) {
              setState((previous) => ({ ...previous, currentPrice: price }));
            }
          }
          return;
        }
        if (KNOWN_BAR_KEYS.some((key) => key.toLowerCase() === normalizedBase)) {
          const normalized = normalizeBarEventPayload(payload, {
            symbol: trimmedSymbol,
            timeframe: SNAPSHOT_TIMEFRAME,
            intervalSeconds: SNAPSHOT_INTERVAL_SECONDS,
            durationSeconds: SNAPSHOT_DURATION_SECONDS
          });
          if (normalized?.snapshot?.bars?.length) {
            const deduped = limitBars(dedupeMarketBars(normalized.snapshot.bars));
            setState((previous) => {
              const merged = mergeBarCollection(previous.bars, deduped);
              const lastClose = deduped[deduped.length - 1]?.close ?? null;
              const nextPrice =
                typeof lastClose === 'number' && Number.isFinite(lastClose)
                  ? lastClose
                  : previous.currentPrice;
              if (merged === previous.bars && nextPrice === previous.currentPrice) {
                return previous;
              }
              return {
                ...previous,
                bars: merged,
                currentPrice: nextPrice
              };
            });
            return;
          }
          if (normalized?.bar) {
            const { bar } = normalized;
            if (bar) {
              setState((previous) => {
                const merged = mergeBars(previous.bars, bar);
                const closePrice = bar.close;
                const nextPrice =
                  typeof closePrice === 'number' && Number.isFinite(closePrice)
                    ? closePrice
                    : previous.currentPrice;
                return {
                  ...previous,
                  bars: merged,
                  currentPrice: nextPrice
                };
              });
            }
          }
        }
      },
      onError: () => {
        if (!disposed) {
          setState((previous) => ({ ...previous, error: '实时行情连接异常' }));
        }
      },
      onClose: () => {
        if (!disposed) {
          setState((previous) => ({ ...previous, error: '实时行情连接已断开' }));
        }
      }
    });

    subscriptionRef.current = handle;

    return () => {
      disposed = true;
      handle.dispose();
      if (subscriptionRef.current === handle) {
        subscriptionRef.current = null;
      }
    };
  }, [clearSubscription, open, store, symbol, token]);

  return useMemo(
    () => ({
      currentPrice: state.currentPrice,
      bars: state.bars,
      loading: state.loading,
      error: state.error
    }),
    [state]
  );
}
