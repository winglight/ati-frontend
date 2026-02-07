const assert = (condition: unknown, message: string): void => {
  if (!condition) {
    throw new Error(message);
  }
};

const globalContext = globalThis as typeof globalThis & {
  window?: Window & typeof globalThis;
  name?: string;
};

if (typeof globalContext.name !== 'string') {
  globalContext.name = '';
}
if (!globalContext.window) {
  globalContext.window = globalContext as Window & typeof globalThis;
}

import type { AnyAction } from '@reduxjs/toolkit';
import type { AppDispatch } from '@store/index';
import { OrdersRealtimeClient } from './ordersRealtime.js';

const createDispatch = () => {
  const actions: AnyAction[] = [];
  const baseState = {
    auth: { token: 'token' },
    orders: {
      items: [],
      status: 'succeeded',
      error: undefined,
      total: 0,
      page: 1,
      pageSize: 25,
      hasNext: false,
      filters: { status: [], symbol: '', source: '', includeDeleted: false },
      lastUpdated: undefined,
      cancellingIds: [],
      bulkCancelStatus: 'idle',
      cancelAllSummary: null,
      submitStatus: 'idle',
      submitError: undefined,
      positionCloseStatus: 'idle',
      positionCloseError: undefined,
      positionReverseStatus: 'idle',
      positionReverseError: undefined,
      syncStatus: 'idle'
    }
  } as const;

  const dispatch: AppDispatch = ((
    input:
      | AnyAction
      | ((dispatch: AppDispatch, getState: () => typeof baseState, extra?: unknown) => unknown)
  ) => {
    if (typeof input === 'function') {
      return input(dispatch, () => baseState as never, undefined);
    }
    actions.push(input);
    return input;
  }) as AppDispatch;

  return { actions, dispatch };
};

const setupFakeTimers = () => {
  const timers = new Map<number, () => void>();
  const intervals = new Set<number>();
  let nextId = 1;
  const windowRef = globalContext.window!;
  const originalSetTimeout = windowRef.setTimeout.bind(windowRef);
  const originalClearTimeout = windowRef.clearTimeout.bind(windowRef);
  const originalSetInterval = windowRef.setInterval.bind(windowRef);
  const originalClearInterval = windowRef.clearInterval.bind(windowRef);

  windowRef.setTimeout = ((callback: TimerHandler) => {
    if (typeof callback !== 'function') {
      throw new Error('Unsupported timer callback');
    }
    const id = nextId++;
    timers.set(id, () => {
      timers.delete(id);
      (callback as () => void)();
    });
    return id;
  }) as typeof window.setTimeout;

  windowRef.clearTimeout = ((id: number) => {
    timers.delete(id);
  }) as typeof window.clearTimeout;

  windowRef.setInterval = ((callback: TimerHandler) => {
    if (typeof callback !== 'function') {
      throw new Error('Unsupported timer callback');
    }
    const id = nextId++;
    intervals.add(id);
    return id;
  }) as typeof window.setInterval;

  windowRef.clearInterval = ((id: number) => {
    intervals.delete(id);
  }) as typeof window.clearInterval;

  return {
    timers,
    intervals,
    restore() {
      windowRef.setTimeout = originalSetTimeout;
      windowRef.clearTimeout = originalClearTimeout;
      windowRef.setInterval = originalSetInterval;
      windowRef.clearInterval = originalClearInterval;
    }
  };
};

// Test: snapshot payload replaces list and disables refresh polling
{
  const { actions, dispatch } = createDispatch();
  const timers = setupFakeTimers();
  const client = new OrdersRealtimeClient({
    dispatch,
    tokenProvider: () => 'token',
    pollIntervalMs: 25,
    refreshDebounceMs: 10
  });

  try {
    (client as unknown as { started: boolean }).started = true;

    (client as unknown as { handleEvent: (envelope: Record<string, unknown>) => void }).handleEvent({
      event: 'orders.status',
      payload: {
        id: 'order-1',
        symbol: 'ES',
        status: 'working',
        quantity: 1,
        filled_quantity: 0,
        order_type: 'market'
      },
      timestamp: '2024-01-01T00:00:00.000Z'
    });

    assert(timers.timers.size === 1, 'Status updates should schedule a refresh before snapshots are detected');
    assert((client as unknown as { refreshTimer: number | null }).refreshTimer !== null, 'Refresh timer should be armed before snapshot');

    (client as unknown as { pollTimer: number | null }).pollTimer = 42;

    (client as unknown as { handleEvent: (envelope: Record<string, unknown>) => void }).handleEvent({
      event: 'orders.snapshot',
      payload: {
        items: [
          {
            id: 'order-99',
            symbol: 'NQ',
            status: 'filled',
            quantity: 2,
            filled_quantity: 2,
            order_type: 'limit',
            updated_at: '2024-01-01T01:00:00.000Z'
          }
        ],
        total: 1,
        page: 2,
        page_size: 50,
        has_next: true,
        received_at: '2024-01-01T01:05:00.000Z'
      },
      timestamp: '2024-01-01T01:05:00.000Z'
    });

    const snapshotAction = actions.find((action) => action.type === 'orders/setOrdersSnapshot');
    assert(snapshotAction, 'Snapshot event should dispatch setOrdersSnapshot');
    assert(
      snapshotAction && snapshotAction.payload.items.length === 1 && snapshotAction.payload.items[0].id === 'order-99',
      'Snapshot payload should replace order collection'
    );
    assert(timers.timers.size === 0, 'Snapshot should clear pending refresh timers');
    assert((client as unknown as { refreshTimer: number | null }).refreshTimer === null, 'Snapshot should clear refresh timer reference');
    assert((client as unknown as { pollTimer: number | null }).pollTimer === null, 'Snapshot should stop background polling');

    const heartbeatAction = actions.find(
      (action) => action.type === 'realtime/setHeartbeat' && action.payload?.channel === 'orders'
    );
    assert(heartbeatAction, 'Snapshot event should update heartbeat metadata');

    (client as unknown as { handleEvent: (envelope: Record<string, unknown>) => void }).handleEvent({
      event: 'orders.status',
      payload: {
        id: 'order-99',
        symbol: 'NQ',
        status: 'working',
        quantity: 2,
        filled_quantity: 0,
        order_type: 'limit'
      },
      timestamp: '2024-01-01T01:06:00.000Z'
    });

    assert(
      timers.timers.size === 0,
      'Status updates should not schedule refresh timers once snapshots are flowing'
    );
  } finally {
    timers.restore();
  }
}

console.log('ordersRealtime snapshot tests passed');
