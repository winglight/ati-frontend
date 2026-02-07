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

import { createOrder, mapOrderEventToChanges, mapOrderRecord } from './ordersApi.js';

const record = {
  id: 42,
  symbol: 'ESM4',
  side: 'Long',
  order_type: 'STOP LIMIT',
  quantity: '10',
  filled_quantity: '5',
  status: 'cancelled - partial',
  price: '4221.75',
  timestamp: '2024-04-01T12:00:00Z',
  metadata: { source: 'strategy-alpha' }
};

const normalized = mapOrderRecord(record);

assert(normalized.id === '42', 'mapOrderRecord should expose normalized id');
assert(normalized.symbol === 'ESM4', 'mapOrderRecord should preserve symbol');
assert(normalized.side === 'buy', 'mapOrderRecord should normalize order side');
assert(normalized.type === 'stop', 'mapOrderRecord should normalize order type');
assert(normalized.quantity === 10, 'mapOrderRecord should parse quantity as number');
assert(normalized.filled === 5, 'mapOrderRecord should parse filled quantity as number');
assert(normalized.status === 'cancelled', 'mapOrderRecord should map composite statuses');
assert(normalized.rawStatus === 'cancelled - partial', 'mapOrderRecord should preserve raw status text');
assert(normalized.price === 4221.75, 'mapOrderRecord should parse primary price field');
assert(normalized.source === 'strategy-alpha', 'mapOrderRecord should infer source from metadata');
assert(normalized.updatedAt === '2024-04-01T12:00:00Z', 'mapOrderRecord should resolve timestamp');
assert(normalized.remaining === 5, 'mapOrderRecord should compute remaining quantity');
assert(normalized.raw && normalized.raw.symbol === 'ESM4', 'mapOrderRecord should retain raw payload');

const event = {
  order_id: 'A1',
  side: 'S',
  filled_quantity: '3',
  status: 'executed',
  order_type: 'market',
  timestamp: '2024-04-02T08:00:00Z',
  metadata: { source: 'desk' }
};

const eventResult = mapOrderEventToChanges(event);

assert(eventResult !== null, 'mapOrderEventToChanges should return change set');
assert(eventResult?.id === 'A1', 'mapOrderEventToChanges should use identifier fields');
assert(eventResult?.changes.side === 'sell', 'mapOrderEventToChanges should normalize side');
assert(eventResult?.changes.type === 'market', 'mapOrderEventToChanges should normalize order type');
assert(eventResult?.changes.filled === 3, 'mapOrderEventToChanges should parse filled quantity');
assert(eventResult?.changes.status === 'filled', 'mapOrderEventToChanges should map status');
assert(eventResult?.changes.rawStatus === 'executed', 'mapOrderEventToChanges should preserve raw status');
assert(eventResult?.changes.source === 'desk', 'mapOrderEventToChanges should propagate source metadata');
assert(eventResult?.changes.updatedAt === '2024-04-02T08:00:00Z', 'mapOrderEventToChanges should propagate timestamps');

const missingIdentifier = mapOrderEventToChanges({ status: 'pending' });
assert(missingIdentifier === null, 'mapOrderEventToChanges should return null when identifier missing');

const inactiveRecord = mapOrderRecord({
  ...record,
  id: 99,
  status: 'Inactive'
});

assert(inactiveRecord.status === 'inactive', 'mapOrderRecord should classify inactive orders');
assert(inactiveRecord.rawStatus === 'Inactive', 'mapOrderRecord should retain inactive raw status');

const cancelledEvent = mapOrderEventToChanges({ order_id: 'B2', status: 'ApiCancelled' });

assert(cancelledEvent, 'mapOrderEventToChanges should handle ApiCancelled status');
assert(cancelledEvent?.changes.status === 'cancelled', 'mapOrderEventToChanges should map ApiCancelled to cancelled');
assert(cancelledEvent?.changes.rawStatus === 'ApiCancelled', 'mapOrderEventToChanges should expose raw ApiCancelled status');

const originalFetch = globalThis.fetch;
const issuedRequests: Array<{ input: unknown; body: Record<string, unknown> }> = [];

globalThis.fetch = (async (input: unknown, init?: RequestInit) => {
  const rawBody = init?.body && typeof init.body === 'string' ? init.body : '';
  const parsedBody = rawBody ? (JSON.parse(rawBody) as Record<string, unknown>) : {};
  issuedRequests.push({ input, body: parsedBody });
  return new Response(
    JSON.stringify({
      order: {
        id: 101,
        symbol: 'ES',
        side: 'BUY',
        status: 'PendingSubmit',
        quantity: 1,
        order_type: 'LMT',
        price: 4221.75,
        limit_price: 4221.75,
        filled_quantity: 0
      }
    }),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    }
  );
}) as typeof fetch;

try {
  const createdOrder = await createOrder('test-token', {
    symbol: 'ES',
    side: 'buy',
    type: 'limit',
    quantity: 1,
    price: 4221.75
  });

  assert(issuedRequests.length === 1, 'createOrder should send a single request');
  const [{ body: requestBody }] = issuedRequests;
  assertDeepEqual(
    requestBody.limit_price,
    4221.75,
    'createOrder should include limit_price when submitting limit orders'
  );
  assertDeepEqual(
    requestBody.price,
    4221.75,
    'createOrder should preserve the price field for limit orders'
  );
  assert(createdOrder.limitPrice === 4221.75, 'createOrder should return normalized limit price');
} finally {
  globalThis.fetch = originalFetch;
}

console.log('ordersApi mapping helpers tests passed');
