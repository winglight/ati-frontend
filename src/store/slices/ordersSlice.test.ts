const assert = (condition: unknown, message: string): void => {
  if (!condition) {
    throw new Error(message);
  }
};

import reducer, { setOrdersSnapshot, upsertOrder, updateOrder } from './ordersSlice.js';

const createBaseState = () => reducer(undefined, { type: '@@INIT' });

const baseOrder = {
  id: 'order-1',
  symbol: 'ESM4',
  side: 'buy' as const,
  type: 'market' as const,
  quantity: 2,
  filled: 2,
  status: 'filled' as const,
  source: 'broker',
  updatedAt: '2024-01-01T00:00:00.000Z',
  commission: 1.5,
  pnl: 320,
  realizedPnl: 300,
  unrealizedPnl: 25
};

const stateWithFilledOrder = reducer(createBaseState(), upsertOrder(baseOrder));

const statusOnlyUpdate = {
  id: 'order-1',
  symbol: 'ESM4',
  side: 'buy' as const,
  type: 'market' as const,
  quantity: 2,
  filled: 2,
  status: 'cancelled' as const,
  source: 'broker',
  updatedAt: '2024-01-01T00:05:00.000Z',
  commission: null,
  pnl: null,
  realizedPnl: null
};

const afterStatusOnlyUpsert = reducer(stateWithFilledOrder, upsertOrder(statusOnlyUpdate));

const orderAfterUpsert = afterStatusOnlyUpsert.items[0];

assert(orderAfterUpsert.status === 'cancelled', 'Order status should update from subsequent payloads');
assert(orderAfterUpsert.commission === 1.5, 'Commission should persist when subsequent payload omits metrics');
assert(orderAfterUpsert.pnl === 320, 'PnL should persist when subsequent payload omits metrics');
assert(orderAfterUpsert.realizedPnl === 300, 'Realized PnL should persist when subsequent payload omits metrics');
assert(orderAfterUpsert.unrealizedPnl === 25, 'Unrealized PnL should persist when subsequent payload omits metrics');

const afterStatusUpdateAction = reducer(
  afterStatusOnlyUpsert,
  updateOrder({
    id: 'order-1',
    changes: {
      status: 'filled',
      commission: null,
      pnl: null,
      realizedPnl: null
    }
  })
);

const orderAfterUpdate = afterStatusUpdateAction.items[0];

assert(orderAfterUpdate.status === 'filled', 'Order status should update through the updateOrder reducer');
assert(orderAfterUpdate.commission === 1.5, 'Commission should persist when updateOrder receives null metrics');
assert(orderAfterUpdate.pnl === 320, 'PnL should persist when updateOrder receives null metrics');
assert(orderAfterUpdate.realizedPnl === 300, 'Realized PnL should persist when updateOrder receives null metrics');
assert(orderAfterUpdate.unrealizedPnl === 25, 'Unrealized PnL should persist when updateOrder receives null metrics');

const zeroMetricsUpdate = {
  id: 'order-1',
  symbol: 'ESM4',
  side: 'buy' as const,
  type: 'market' as const,
  quantity: 2,
  filled: 2,
  status: 'filled' as const,
  source: 'broker',
  updatedAt: '2024-01-01T00:10:00.000Z',
  commission: 0,
  pnl: 0,
  realizedPnl: 0,
  unrealizedPnl: 0
};

const afterZeroMetricsUpsert = reducer(stateWithFilledOrder, upsertOrder(zeroMetricsUpdate));

const orderAfterZeroUpsert = afterZeroMetricsUpsert.items[0];

assert(
  orderAfterZeroUpsert.commission === 1.5,
  'Commission should not be replaced by zero-valued payloads'
);
assert(orderAfterZeroUpsert.pnl === 320, 'PnL should not be replaced by zero-valued payloads');
assert(
  orderAfterZeroUpsert.realizedPnl === 300,
  'Realized PnL should not be replaced by zero-valued payloads'
);
assert(
  orderAfterZeroUpsert.unrealizedPnl === 25,
  'Unrealized PnL should not be replaced by zero-valued payloads'
);

const afterZeroMetricsUpdate = reducer(
  afterZeroMetricsUpsert,
  updateOrder({
    id: 'order-1',
    changes: {
      commission: 0,
      pnl: 0,
      realizedPnl: 0,
      unrealizedPnl: 0
    }
  })
);

const orderAfterZeroUpdate = afterZeroMetricsUpdate.items[0];

assert(
  orderAfterZeroUpdate.commission === 1.5,
  'Commission should resist zero-valued updates through updateOrder'
);
assert(orderAfterZeroUpdate.pnl === 320, 'PnL should resist zero-valued updates through updateOrder');
assert(
  orderAfterZeroUpdate.realizedPnl === 300,
  'Realized PnL should resist zero-valued updates through updateOrder'
);
assert(
  orderAfterZeroUpdate.unrealizedPnl === 25,
  'Unrealized PnL should resist zero-valued updates through updateOrder'
);

const epsilonMetricsUpdate = reducer(
  stateWithFilledOrder,
  updateOrder({
    id: 'order-1',
    changes: {
      commission: 5e-10,
      pnl: 4e-10,
      realizedPnl: 3e-10,
      unrealizedPnl: 2e-10
    }
  })
);

const orderAfterEpsilonUpdate = epsilonMetricsUpdate.items[0];

assert(
  orderAfterEpsilonUpdate.commission === 1.5,
  'Commission should ignore near-zero updates when an existing value is present'
);
assert(
  orderAfterEpsilonUpdate.pnl === 320,
  'PnL should ignore near-zero updates when an existing value is present'
);
assert(
  orderAfterEpsilonUpdate.realizedPnl === 300,
  'Realized PnL should ignore near-zero updates when an existing value is present'
);
assert(
  orderAfterEpsilonUpdate.unrealizedPnl === 25,
  'Unrealized PnL should ignore near-zero updates when an existing value is present'
);

const snapshotOrder = {
  ...baseOrder,
  id: 'order-2',
  status: 'working' as const,
  updatedAt: '2024-01-01T01:00:00.000Z'
};

const failedState = {
  ...stateWithFilledOrder,
  status: 'failed' as const,
  error: 'Load failed'
};

const snapshotPayload = {
  items: [snapshotOrder],
  total: 1,
  page: 2,
  pageSize: 50,
  hasNext: true,
  receivedAt: '2024-01-01T01:05:00.000Z'
};

const afterSnapshot = reducer(failedState, setOrdersSnapshot(snapshotPayload));

assert(afterSnapshot.status === 'succeeded', 'Snapshot reducer should mark orders as succeeded');
assert(afterSnapshot.error === undefined, 'Snapshot reducer should clear transient errors');
assert(afterSnapshot.items.length === 1, 'Snapshot reducer should replace the orders collection');
assert(afterSnapshot.items[0].id === 'order-2', 'Snapshot reducer should overwrite existing orders');
assert(afterSnapshot.total === 1, 'Snapshot reducer should update total count');
assert(afterSnapshot.page === 2, 'Snapshot reducer should update page number');
assert(afterSnapshot.pageSize === 50, 'Snapshot reducer should update page size');
assert(afterSnapshot.hasNext === true, 'Snapshot reducer should update pagination flags');
assert(afterSnapshot.lastUpdated === '2024-01-01T01:05:00.000Z', 'Snapshot reducer should update lastUpdated timestamp');

console.log('ordersSlice reducer tests passed');
