import { mapStrategyPerformance } from './strategyApi.js';

const normalize = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map(normalize);
  }
  if (value && typeof value === 'object') {
    return Object.keys(value as Record<string, unknown>)
      .sort()
      .reduce<Record<string, unknown>>((acc, key) => {
        acc[key] = normalize((value as Record<string, unknown>)[key]);
        return acc;
      }, {});
  }
  return value;
};

const assert = (condition: unknown, message: string): void => {
  if (!condition) {
    throw new Error(message);
  }
};

const assertDeepEqual = (left: unknown, right: unknown, message: string): void => {
  const leftJson = JSON.stringify(normalize(left));
  const rightJson = JSON.stringify(normalize(right));
  if (leftJson !== rightJson) {
    throw new Error(`${message}\nExpected: ${rightJson}\nReceived: ${leftJson}`);
  }
};

const baseSnapshot = {
  summary: { totalPnl: 120 },
  orders: [
    {
      id: 'alpha-0',
      timestamp: '2024-05-01T00:00:00Z',
      side: 'buy',
      quantity: 1,
      price: 100,
      pnl: null,
      metadata: null
    }
  ],
  totalOrders: 1,
  page: 1,
  pageSize: 10,
  hasNext: false,
  period: 'day',
  charts: null,
  calendar: null,
  updatedAt: '2024-05-01T00:00:00Z'
};

const ordersOnlyPayload = {
  strategy_id: 'alpha',
  id: 'alpha-id',
  name: 'Alpha',
  period: 'day',
  market_timezone: 'UTC',
  orders: {
    items: [
      {
        order_id: '1001',
        timestamp: '2024-05-01T01:00:00Z',
        quantity: 2,
        price: 110,
        side: 'sell',
        notes: 'fresh breakout entry'
      }
    ],
    total: 1,
    page: 2,
    page_size: 10,
    has_next: true
  },
  updated_at: '2024-05-01T01:05:00Z'
};

const mergedOrders = mapStrategyPerformance('alpha', ordersOnlyPayload, 'day', baseSnapshot, [
  'orders'
]);

assertDeepEqual(mergedOrders.summary, baseSnapshot.summary, 'orders-only update should keep summary');
assert(mergedOrders.orders?.length === 1, 'orders should be replaced with fresh payload');
assert(
  mergedOrders.orders?.[0]?.notes === 'fresh breakout entry',
  'mapped orders should preserve note strings'
);
const mappedOrderMetadata = mergedOrders.orders?.[0]?.metadata as Record<string, unknown> | null | undefined;
assert(
  !mappedOrderMetadata || !Object.prototype.hasOwnProperty.call(mappedOrderMetadata, 'notes'),
  'notes should not be duplicated inside order metadata'
);
assert(mergedOrders.page === 2, 'page should follow response payload');
assert(mergedOrders.hasNext === true, 'hasNext should follow response payload');
assert(mergedOrders.updatedAt === '2024-05-01T01:05:00Z', 'updatedAt should refresh when provided');

const summaryOnlyPayload = {
  strategy_id: 'alpha',
  id: 'alpha-id',
  name: 'Alpha',
  period: 'day',
  market_timezone: 'UTC',
  summary: { totalPnl: 360, dailyPnl: 40 },
  updated_at: '2024-05-01T02:00:00Z'
};

const mergedSummary = mapStrategyPerformance('alpha', summaryOnlyPayload, 'day', mergedOrders, [
  'summary'
]);

assertDeepEqual(
  mergedSummary.orders,
  mergedOrders.orders,
  'summary-only update should preserve cached orders'
);
assertDeepEqual(
  mergedSummary.summary,
  { totalPnl: 360, dailyPnl: 40 },
  'summary-only update should merge new summary values'
);

const otherPeriodSnapshot = {
  ...baseSnapshot,
  period: 'week'
};

const resetPayload = {
  strategy_id: 'alpha',
  id: 'alpha-id',
  name: 'Alpha',
  period: 'day',
  market_timezone: 'UTC',
  summary: { totalPnl: 900 },
  orders: null,
  updated_at: '2024-05-02T00:00:00Z'
};

const resetResult = mapStrategyPerformance('alpha', resetPayload, 'day', otherPeriodSnapshot, [
  'summary',
  'orders'
]);

assert(resetResult.period === 'day', 'mapping should respect requested period');
assertDeepEqual(
  resetResult.summary,
  { totalPnl: 900 },
  'different-period baseline should not leak into new snapshot'
);
assertDeepEqual(
  resetResult.orders,
  [],
  'explicit null orders should reset cached trades'
);

console.log('strategyApi performance mapping tests passed');
