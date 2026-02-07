import type { OrderItem } from '@features/dashboard/types';
import { DEFAULT_MARKET_TIMEZONE } from '@utils/timezone';
import { listOrders } from './ordersApi';

export interface PnLCalendarTrade {
  TransactionID: string;
  Symbol: string;
  TradeDate: string;
  DateTime: string;
  Quantity: number;
  FifoPnlRealized: number;
  'Buy/Sell': 'Buy' | 'Sell';
  OpenDateTime: string | null;
  Instrument?: string | null;
  Strategy?: string | null;
  StrategyName?: string | null;
}

const resolveDateTime = (value?: string | null): string | null => {
  if (!value) {
    return null;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf())) {
    return null;
  }
  return parsed.toISOString();
};

const marketDateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: DEFAULT_MARKET_TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit'
});

const formatDateInMarketTimezone = (value: Date): string | null => {
  const parts = marketDateFormatter.formatToParts(value);
  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  const day = parts.find((part) => part.type === 'day')?.value;
  if (!year || !month || !day) {
    return null;
  }
  return `${year}-${month}-${day}`;
};

const shiftDateKey = (dateKey: string, offsetDays: number): string => {
  const [yearRaw, monthRaw, dayRaw] = dateKey.split('-');
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  const day = Number(dayRaw);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return dateKey;
  }
  const shifted = new Date(Date.UTC(year, month - 1, day));
  shifted.setUTCDate(shifted.getUTCDate() + offsetDays);
  return shifted.toISOString().slice(0, 10);
};

// Futures sessions can open on Sunday evening; attribute weekend fills to the nearest business day.
const normalizeBusinessTradeDate = (dateKey: string): string => {
  const [yearRaw, monthRaw, dayRaw] = dateKey.split('-');
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  const day = Number(dayRaw);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return dateKey;
  }
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  if (weekday === 0) {
    return shiftDateKey(dateKey, 1);
  }
  if (weekday === 6) {
    return shiftDateKey(dateKey, -1);
  }
  return dateKey;
};

const resolveOrderDateTime = (order: OrderItem): string | null => {
  const candidates = [order.executedAt, order.updatedAt, order.createdAt, resolveRawDateTime(order)];
  for (const candidate of candidates) {
    const resolved = resolveDateTime(candidate);
    if (resolved) {
      return resolved;
    }
  }
  return null;
};

const resolveTradeDate = (dateTime: string | null): string => {
  if (!dateTime) {
    return '';
  }
  if (!dateTime.includes('T')) {
    return normalizeBusinessTradeDate(dateTime);
  }
  const parsed = new Date(dateTime);
  if (!Number.isNaN(parsed.valueOf())) {
    const dateKey = formatDateInMarketTimezone(parsed);
    if (dateKey) {
      return normalizeBusinessTradeDate(dateKey);
    }
  }
  return normalizeBusinessTradeDate(dateTime.split('T')[0]);
};

const resolveRawOpenDateTime = (order: OrderItem): string | null => {
  const raw = order.raw;
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const candidates = [
    'open_datetime',
    'openDateTime',
    'open_date_time',
    'open_date',
    'open_time',
    'open_timestamp',
    'opened_at',
    'open_at',
    'openedAt',
    'openAt'
  ];

  for (const key of candidates) {
    if (!(key in raw)) {
      continue;
    }
    const value = (raw as Record<string, unknown>)[key];
    if (typeof value === 'string') {
      const resolved = resolveDateTime(value);
      if (resolved) {
        return resolved;
      }
      continue;
    }
    if (typeof value === 'number') {
      const date = new Date(value);
      if (!Number.isNaN(date.valueOf())) {
        return date.toISOString();
      }
    }
  }

  return null;
};

const resolveRawDateTime = (order: OrderItem): string | null => {
  const raw = order.raw;
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const candidates = [
    'executed_at',
    'executedAt',
    'filled_at',
    'filledAt',
    'fill_time',
    'fillTime',
    'last_fill_time',
    'lastFillTime',
    'trade_time',
    'tradeTime',
    'timestamp',
    'created_at',
    'createdAt',
    'updated_at',
    'updatedAt'
  ];

  for (const key of candidates) {
    if (!(key in raw)) {
      continue;
    }
    const value = (raw as Record<string, unknown>)[key];
    if (typeof value === 'string') {
      const resolved = resolveDateTime(value);
      if (resolved) {
        return resolved;
      }
    }
    if (typeof value === 'number') {
      const date = new Date(value);
      if (!Number.isNaN(date.valueOf())) {
        return date.toISOString();
      }
    }
  }

  return null;
};

const resolveRawStrategy = (order: OrderItem): { strategy: string | null; strategyName: string | null } => {
  const raw = order.raw;
  if (!raw || typeof raw !== 'object') {
    return { strategy: order.strategy ?? null, strategyName: order.strategyName ?? null };
  }

  const candidates = ['strategy', 'strategy_name', 'strategyName'];
  const resolved: { strategy: string | null; strategyName: string | null } = {
    strategy: order.strategy ?? null,
    strategyName: order.strategyName ?? null
  };

  for (const key of candidates) {
    if (!(key in raw)) {
      continue;
    }
    const value = (raw as Record<string, unknown>)[key];
    if (typeof value === 'string') {
      if (key === 'strategy' || key === 'strategy_name') {
        resolved.strategy = value;
      } else {
        resolved.strategyName = value;
      }
    }
  }

  return resolved;
};

const resolveRawInstrument = (order: OrderItem): string | null => {
  if (order.secType) {
    return order.secType;
  }

  const raw = order.raw;
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const candidates = [
    'instrument',
    'instrument_type',
    'instrumentType',
    'secType',
    'security_type',
    'securityType',
    'asset',
    'asset_class',
    'assetClass',
    'product_type',
    'productType'
  ];

  for (const key of candidates) {
    if (!(key in raw)) {
      continue;
    }
    const value = (raw as Record<string, unknown>)[key];
    if (typeof value === 'string' && value.trim()) {
      return value;
    }
  }

  return null;
};

const buildSymbolTimeline = (orders: OrderItem[]): Map<string, OrderItem[]> => {
  const timeline = new Map<string, OrderItem[]>();
  for (const order of orders) {
    if (!timeline.has(order.symbol)) {
      timeline.set(order.symbol, []);
    }
    timeline.get(order.symbol)?.push(order);
  }

  for (const [, ordersForSymbol] of timeline) {
    ordersForSymbol.sort((a, b) => {
      const timeA = resolveOrderDateTime(a);
      const timeB = resolveOrderDateTime(b);
      if (!timeA && !timeB) {
        return 0;
      }
      if (!timeA) {
        return 1;
      }
      if (!timeB) {
        return -1;
      }
      return timeA.localeCompare(timeB);
    });
  }

  return timeline;
};

const inferOpenDateTime = (
  order: OrderItem,
  dateTime: string | null,
  timeline: Map<string, OrderItem[]>
): string | null => {
  const rawOpen = resolveRawOpenDateTime(order);
  if (rawOpen) {
    return rawOpen;
  }
  if (!dateTime) {
    return null;
  }

  const ordersForSymbol = timeline.get(order.symbol) ?? [];
  const targetTime = new Date(dateTime).valueOf();
  const oppositeSide = order.side === 'sell' ? 'buy' : 'sell';
  let candidate: OrderItem | null = null;

  for (const item of ordersForSymbol) {
    if (item.side !== oppositeSide) {
      continue;
    }
    const itemTime = resolveOrderDateTime(item);
    if (!itemTime) {
      continue;
    }
    if (new Date(itemTime).valueOf() <= targetTime) {
      candidate = item;
    }
  }

  return candidate ? resolveOrderDateTime(candidate) : null;
};

export const mapPnLCalendarTrades = (orders: OrderItem[]): PnLCalendarTrade[] => {
  const timeline = buildSymbolTimeline(orders);

  return orders
    .filter((order) => {
      const realizedPresent = order.realizedPnl !== null && order.realizedPnl !== undefined;
      const pnlPresent = order.pnl !== null && order.pnl !== undefined;
      return realizedPresent || pnlPresent;
    })
    .map((order) => {
      const dateTime = resolveOrderDateTime(order);
      const { strategy, strategyName } = resolveRawStrategy(order);
      const realized = order.realizedPnl ?? order.pnl ?? 0;
      return {
        TransactionID: order.id,
        Symbol: order.symbol,
        TradeDate: resolveTradeDate(dateTime),
        DateTime: dateTime ?? '',
        Quantity: order.filled || order.quantity,
        FifoPnlRealized: realized,
        'Buy/Sell': order.side === 'sell' ? 'Sell' : 'Buy',
        OpenDateTime: inferOpenDateTime(order, dateTime, timeline),
        Instrument: resolveRawInstrument(order),
        Strategy: strategy,
        StrategyName: strategyName
      };
    });
};

export const listPnLCalendarTrades = async (token: string): Promise<PnLCalendarTrade[]> => {
  const pageSize = 500;
  let page = 1;
  let hasNext = true;
  const items: OrderItem[] = [];

  while (hasNext) {
    const orders = await listOrders(token, { page, pageSize });
    items.push(...orders.items);
    hasNext = orders.hasNext;
    page += 1;
    if (!orders.hasNext || orders.items.length === 0) {
      break;
    }
  }

  return mapPnLCalendarTrades(items);
};
