import type {
  DepthEntry,
  DepthSnapshot,
  MarketBar,
  MarketKlineSnapshot,
  MarketTickerSnapshot
} from '@features/dashboard/types';
import { extractRootSymbol } from '@features/dashboard/utils/priceFormatting';
import { dedupeMarketBars, mapMarketBar } from './marketApi';
import { normalizeTimestampToUtc } from '../utils/timezone.js';

type NullableNumber = number | string | null | undefined;

interface DepthPayloadLevel {
  price?: NullableNumber;
  size?: NullableNumber;
}

interface DepthEventPayload {
  symbol?: string;
  bids?: DepthPayloadLevel[];
  asks?: DepthPayloadLevel[];
  best_bid?: DepthPayloadLevel | null;
  best_ask?: DepthPayloadLevel | null;
  bestBid?: DepthPayloadLevel | null;
  bestAsk?: DepthPayloadLevel | null;
  best_bid_price?: NullableNumber;
  best_bid_size?: NullableNumber;
  best_ask_price?: NullableNumber;
  best_ask_size?: NullableNumber;
  bestBidPrice?: NullableNumber;
  bestBidSize?: NullableNumber;
  bestAskPrice?: NullableNumber;
  bestAskSize?: NullableNumber;
  total_bid_size?: NullableNumber;
  total_ask_size?: NullableNumber;
  totalBidSize?: NullableNumber;
  totalAskSize?: NullableNumber;
  mid_price?: NullableNumber;
  spread?: NullableNumber;
  timestamp?: string;
}

interface TickerEventPayload {
  symbol?: string;
  bid?: NullableNumber;
  bid_price?: NullableNumber;
  bidPrice?: NullableNumber;
  ask?: NullableNumber;
  ask_price?: NullableNumber;
  askPrice?: NullableNumber;
  last?: NullableNumber;
  last_price?: NullableNumber;
  lastPrice?: NullableNumber;
  trade_price?: NullableNumber;
  price?: NullableNumber;
  last_size?: NullableNumber;
  close?: NullableNumber;
  close_price?: NullableNumber;
  closePrice?: NullableNumber;
  mid_price?: NullableNumber;
  midPrice?: NullableNumber;
  mid?: NullableNumber;
  mark?: NullableNumber;
  mark_price?: NullableNumber;
  markPrice?: NullableNumber;
  spread?: NullableNumber;
  bid_ask_spread?: NullableNumber;
  bidAskSpread?: NullableNumber;
  timestamp?: string;
}

interface BarEventPayload {
  symbol?: string;
  timeframe?: string;
  duration?: string | number | null;
  duration_seconds?: NullableNumber;
  durationSeconds?: NullableNumber;
  interval_seconds?: NullableNumber;
  intervalSeconds?: NullableNumber;
  metadata?: Record<string, unknown> | null;
  bars?: unknown;
  bar?: unknown;
  is_snapshot?: boolean;
}

type PartialBarPayload = Record<string, unknown> | null | undefined;

export interface NormalizeBarEventContext {
  symbol?: string | null;
  timeframe?: string | null;
  intervalSeconds: number;
  durationSeconds: number;
}

export interface NormalizedBarEvent {
  snapshot?: MarketKlineSnapshot;
  bar?: MarketBar;
  symbol?: string;
  timeframe?: string;
  intervalSeconds: number;
  durationSeconds: number;
}

const toNumber = (value: NullableNumber): number | null => {
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
};

const sanitizePrice = (value: number | null): number | null => {
  if (value === null) {
    return null;
  }
  return value < 0 ? null : value;
};

const toDepthEntries = (levels?: DepthPayloadLevel[]): DepthEntry[] => {
  if (!Array.isArray(levels)) {
    return [];
  }
  const result: DepthEntry[] = [];
  for (const level of levels) {
    if (!level || typeof level !== 'object') {
      continue;
    }
    const price = toNumber(level.price);
    const size = toNumber(level.size);
    if (price === null || size === null) {
      continue;
    }
    result.push({ price, size });
  }
  return result;
};

const buildDepthEntry = (
  level: DepthPayloadLevel | null | undefined,
  fallbackPrice?: NullableNumber,
  fallbackSize?: NullableNumber
): DepthEntry | null => {
  if (!level || typeof level !== 'object') {
    const price = toNumber(fallbackPrice);
    const size = toNumber(fallbackSize);
    if (price === null || size === null) {
      return null;
    }
    return { price, size };
  }
  const price = toNumber(level.price ?? fallbackPrice);
  const size = toNumber(level.size ?? fallbackSize);
  if (price === null || size === null) {
    return null;
  }
  return { price, size };
};

const prependUniqueLevel = (collection: DepthEntry[], candidate: DepthEntry | null) => {
  if (!candidate) {
    return;
  }
  const exists = collection.some((entry) => Math.abs(entry.price - candidate.price) < 1e-6);
  if (!exists) {
    collection.unshift(candidate);
  }
};

const mapBarPayload = (value: PartialBarPayload): MarketBar | null => {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const payload = value as Record<string, unknown>;
  const timestamp = typeof payload.timestamp === 'string' ? payload.timestamp : null;
  if (!timestamp) {
    return null;
  }
  const parseNumeric = (input: unknown, fallback: number | null = null): number | null => {
    if (typeof input === 'number') {
      return toNumber(input);
    }
    if (typeof input === 'string') {
      const parsed = Number(input);
      return toNumber(Number.isFinite(parsed) ? parsed : null);
    }
    return fallback;
  };

  const open = parseNumeric(payload.open, 0) ?? 0;
  const high = parseNumeric(payload.high, open) ?? open;
  const low = parseNumeric(payload.low, open) ?? open;
  const close = parseNumeric(payload.close, open) ?? open;
  const volume = parseNumeric(payload.volume);

  return mapMarketBar({
    timestamp,
    open,
    high,
    low,
    close,
    volume: volume ?? null
  });
};

export const normalizeDepthPayload = (
  data: unknown,
  targetSymbol?: string | null
): DepthSnapshot | null => {
  if (!data || typeof data !== 'object') {
    return null;
  }
  const payload = data as DepthEventPayload;
  const targetRoot = extractRootSymbol(targetSymbol ?? null);
  const payloadRoot = extractRootSymbol(payload.symbol ?? null);
  if (targetRoot && payloadRoot && targetRoot !== payloadRoot) {
    return null;
  }
  const bids = toDepthEntries(payload.bids);
  const asks = toDepthEntries(payload.asks);

  const bestBid = buildDepthEntry(
    payload.best_bid ?? payload.bestBid ?? null,
    payload.best_bid_price ?? payload.bestBidPrice,
    payload.best_bid_size ?? payload.bestBidSize
  );
  const bestAsk = buildDepthEntry(
    payload.best_ask ?? payload.bestAsk ?? null,
    payload.best_ask_price ?? payload.bestAskPrice,
    payload.best_ask_size ?? payload.bestAskSize
  );

  prependUniqueLevel(bids, bestBid);
  prependUniqueLevel(asks, bestAsk);

  const limitedBids = bids.slice(0, 5);
  const limitedAsks = asks.slice(0, 5);

  const totalBidSize =
    toNumber(payload.total_bid_size ?? payload.totalBidSize ?? null) ??
    (bestBid ? bestBid.size : null);
  const totalAskSize =
    toNumber(payload.total_ask_size ?? payload.totalAskSize ?? null) ??
    (bestAsk ? bestAsk.size : null);

  const hasDepthEntries = limitedBids.length > 0 || limitedAsks.length > 0;
  const hasTotals = totalBidSize !== null || totalAskSize !== null;
  if (!hasDepthEntries && !hasTotals) {
    return null;
  }
  const symbol = payload.symbol ?? targetSymbol ?? undefined;
  let midPrice = toNumber(payload.mid_price);
  let spread = toNumber(payload.spread);
  if (midPrice === null && bestBid && bestAsk) {
    midPrice = Number(((bestBid.price + bestAsk.price) / 2).toFixed(6));
  }
  if (spread === null && bestBid && bestAsk) {
    spread = Number(Math.abs(bestAsk.price - bestBid.price).toFixed(6));
  }
  return {
    bids: limitedBids,
    asks: limitedAsks,
    midPrice,
    spread,
    symbol,
    updatedAt: normalizeTimestampToUtc(payload.timestamp) ?? new Date().toISOString(),
    totalBidSize: totalBidSize ?? null,
    totalAskSize: totalAskSize ?? null
  };
};

export const normalizeTickerPayload = (
  data: unknown,
  targetSymbol?: string | null
): MarketTickerSnapshot | null => {
  if (!data || typeof data !== 'object') {
    return null;
  }
  const payload = data as TickerEventPayload;
  const targetRoot = extractRootSymbol(targetSymbol ?? null);
  const payloadSymbol = typeof payload.symbol === 'string' ? payload.symbol : null;
  const payloadRoot = extractRootSymbol(payloadSymbol);
  if (targetRoot && payloadRoot && payloadRoot !== targetRoot) {
    return null;
  }
  const resolvedSymbol = payloadSymbol ?? targetSymbol ?? '';
  const bid = sanitizePrice(
    toNumber(payload.bid) ??
      toNumber(payload.bid_price) ??
      toNumber(payload.bidPrice)
  );
  const ask = sanitizePrice(
    toNumber(payload.ask) ??
      toNumber(payload.ask_price) ??
      toNumber(payload.askPrice)
  );
  const last = sanitizePrice(
    toNumber(payload.last) ??
      toNumber(payload.last_price) ??
      toNumber(payload.lastPrice) ??
      toNumber(payload.trade_price) ??
      toNumber(payload.price) ??
      toNumber(payload.mark) ??
      toNumber(payload.mark_price) ??
      toNumber(payload.markPrice)
  );
  const close = sanitizePrice(
    toNumber(payload.close) ??
      toNumber(payload.close_price) ??
      toNumber(payload.closePrice)
  );
  const change = last !== null && close !== null ? last - close : null;
  const changePercent = change !== null && close ? (change / close) * 100 : null;
  const midPrice = sanitizePrice(
    toNumber(payload.mid_price) ??
      toNumber(payload.midPrice) ??
      toNumber(payload.mid) ??
      (bid !== null && ask !== null ? Number(((bid + ask) / 2).toFixed(6)) : null)
  );
  const spread =
    toNumber(payload.spread) ??
    toNumber(payload.bid_ask_spread) ??
    toNumber(payload.bidAskSpread) ??
    (bid !== null && ask !== null ? Math.abs(ask - bid) : null);
  return {
    symbol: resolvedSymbol,
    bid,
    ask,
    last,
    lastSize: toNumber(payload.last_size),
    close,
    midPrice,
    spread,
    change,
    changePercent,
    updatedAt: normalizeTimestampToUtc(payload.timestamp) ?? new Date().toISOString()
  };
};

export const normalizeBarEventPayload = (
  data: unknown,
  context: NormalizeBarEventContext
): NormalizedBarEvent | null => {
  if (!data || typeof data !== 'object') {
    return null;
  }
  const payload = data as BarEventPayload;
  const metadata =
    payload.metadata && typeof payload.metadata === 'object'
      ? (payload.metadata as Record<string, unknown>)
      : null;
  const resolvedSymbol =
    typeof payload.symbol === 'string' && payload.symbol.trim()
      ? payload.symbol.trim()
      : context.symbol ?? undefined;
  const resolvedTimeframe =
    typeof payload.timeframe === 'string' && payload.timeframe.trim()
      ? payload.timeframe.trim()
      : (metadata && typeof metadata.timeframe === 'string' && metadata.timeframe.trim()
          ? metadata.timeframe.trim()
          : context.timeframe ?? undefined);
  const parsedInterval =
    toNumber(payload.interval_seconds ?? payload.intervalSeconds ?? null) ??
    (metadata ? toNumber((metadata.interval_seconds ?? metadata.intervalSeconds) as NullableNumber) : null) ??
    context.intervalSeconds;
  const parsedDuration =
    toNumber(payload.duration_seconds ?? payload.durationSeconds ?? payload.duration ?? null) ??
    (metadata ? toNumber((metadata.duration_seconds ?? metadata.durationSeconds) as NullableNumber) : null) ??
    context.durationSeconds;

  const result: NormalizedBarEvent = {
    symbol: resolvedSymbol,
    timeframe: resolvedTimeframe,
    intervalSeconds: parsedInterval,
    durationSeconds: parsedDuration
  };

  const barsValue = Array.isArray(payload.bars) ? payload.bars : null;
  if (barsValue && barsValue.length) {
    const bars: MarketBar[] = [];
    for (const item of barsValue) {
      const mapped = mapBarPayload(item as PartialBarPayload);
      if (mapped) {
        bars.push(mapped);
      }
    }
    const normalizedBars = dedupeMarketBars(bars);
    if (normalizedBars.length) {
      result.snapshot = {
        symbol: resolvedSymbol ?? context.symbol ?? '',
        timeframe: resolvedTimeframe ?? context.timeframe ?? '',
        intervalSeconds: parsedInterval,
        durationSeconds: parsedDuration,
        bars: normalizedBars,
        end: normalizedBars[normalizedBars.length - 1]?.timestamp ?? null
      };
      return result;
    }
  }

  const singleBar = mapBarPayload(payload.bar as PartialBarPayload);
  if (singleBar) {
    result.bar = singleBar;
    return result;
  }

  const fallbackBar = mapBarPayload(payload as PartialBarPayload);
  if (fallbackBar) {
    result.bar = fallbackBar;
    return result;
  }

  return null;
};

export type { NullableNumber };
