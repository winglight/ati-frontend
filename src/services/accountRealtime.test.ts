function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

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
import {
  AccountRealtimeClient,
  accountRealtimeDependencies
} from './accountRealtime.js';
import type {
  AccountPositionsPayload,
  AccountSummaryPayload,
  AccountSubscriptionStatus
} from './accountApi.js';

const originalDependencies = { ...accountRealtimeDependencies };

const restoreDependencies = () => {
  accountRealtimeDependencies.subscribeAccount = originalDependencies.subscribeAccount;
  accountRealtimeDependencies.unsubscribeAccount = originalDependencies.unsubscribeAccount;
  accountRealtimeDependencies.subscribeWebSocket = originalDependencies.subscribeWebSocket;
};

const createDispatch = () => {
  const actions: AnyAction[] = [];
  const dispatch: AppDispatch = ((action: AnyAction) => {
    actions.push(action);
    return action;
  }) as AppDispatch;
  return { actions, dispatch };
};

const setupFakeTimers = () => {
  const timers = new Map<number, () => void>();
  const intervals: TimerHandler[] = [];
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
    intervals.push(callback);
    return nextId++;
  }) as typeof window.setInterval;

  windowRef.clearInterval = (() => {
    /* noop */
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

const offlineResult: { data: AccountSubscriptionStatus; serviceStatus: string } = {
  data: { status: 'offline', subscriptions: 0 },
  serviceStatus: 'Account unavailable'
};

// Test: offline response suppresses websocket and schedules retry
{
  const { actions, dispatch } = createDispatch();
  const timers = setupFakeTimers();
  let socketOpened = false;
  let client: AccountRealtimeClient | null = null;
  try {
    accountRealtimeDependencies.subscribeAccount = async () => offlineResult;
    accountRealtimeDependencies.subscribeWebSocket = () => {
      socketOpened = true;
      return {
        send: () => true,
        isOpen: () => false,
        dispose: () => {
          /* noop */
        }
      };
    };

    client = new AccountRealtimeClient({
      dispatch,
      tokenProvider: () => 'token'
    });

    await client.connect();

    const offlineAction = actions.find(
      (action) =>
        action.type === 'realtime/setConnectionStatus' &&
        action.payload?.channel === 'account' &&
        action.payload?.status === 'offline'
    );
    assert(offlineAction, 'Client should dispatch offline status when service unavailable');
    assert(!socketOpened, 'WebSocket should not open while service is offline');

    assert(
      timers.timers.size === 1,
      'Client should schedule a retry timer when service is offline'
    );
  } finally {
    if (client) {
      await client.disconnect();
    }
    const remainingTimers = timers.timers.size;
    restoreDependencies();
    timers.restore();
    assert(remainingTimers === 0, 'Disconnect should clear pending retry timers');
  }
}

// Test: service recovery re-enables websocket connection
{
  const { actions, dispatch } = createDispatch();
  const timers = setupFakeTimers();
  let subscribeCalls = 0;
  let socketOpened = false;
  let client: AccountRealtimeClient | null = null;
  let resolveRecovery: (() => void) | null = null;
  const subscriptionRecovered = new Promise<void>((resolve) => {
    resolveRecovery = resolve;
  });

  try {
    accountRealtimeDependencies.subscribeAccount = async () => {
      subscribeCalls += 1;
      if (subscribeCalls === 1) {
        return offlineResult;
      }
      resolveRecovery?.();
      resolveRecovery = null;
      return { data: { status: 'subscribed', subscriptions: 1 }, serviceStatus: null };
    };
    accountRealtimeDependencies.unsubscribeAccount = async () => ({
      data: { status: 'unsubscribed', subscriptions: 0 },
      serviceStatus: null
    });
    accountRealtimeDependencies.subscribeWebSocket = (options) => {
      socketOpened = true;
      options.onOpen?.(new Event('open'));
      return {
        send: () => true,
        isOpen: () => true,
        dispose: () => {
          /* noop */
        }
      };
    };

    client = new AccountRealtimeClient({
      dispatch,
      tokenProvider: () => 'token'
    });

    await client.connect();
    const retryEntry = timers.timers.entries().next().value as
      | [number, () => void]
      | undefined;
    if (!retryEntry) {
      throw new Error('Retry timer should be scheduled after offline response');
    }

    const [, retryCallback] = retryEntry;
    retryCallback();
    await subscriptionRecovered;
    await Promise.resolve();

    assert(socketOpened, 'Client should open WebSocket once service recovers');
    assert(subscribeCalls === 2, 'Client should retry subscription after offline response');

    const connectedAction = actions.find(
      (action) =>
        action.type === 'realtime/setConnectionStatus' &&
        action.payload?.channel === 'account' &&
        action.payload?.status === 'connected'
    );
    assert(connectedAction, 'Client should transition to connected when websocket opens');
  } finally {
    if (client) {
      await client.disconnect();
    }
    restoreDependencies();
    timers.restore();
  }
}

// Test: websocket events update account state
{
  const { actions, dispatch } = createDispatch();
  const timers = setupFakeTimers();
  let socketSubscribed = Boolean(false);
  let onMessageHandler: (data: string) => void = () => {};
  let client: AccountRealtimeClient | null = null;

  try {
    accountRealtimeDependencies.subscribeAccount = async () => ({
      data: { status: 'subscribed', subscriptions: 1 },
      serviceStatus: null
    });
    accountRealtimeDependencies.subscribeWebSocket = (options) => {
      socketSubscribed = true;
      options.onOpen?.(new Event('open'));
      onMessageHandler = options.onMessage ?? (() => {});
      return {
        send: () => true,
        isOpen: () => true,
        dispose: () => {
          /* noop */
        }
      };
    };

    client = new AccountRealtimeClient({
      dispatch,
      tokenProvider: () => 'token'
    });

    await client.connect();

    assert(socketSubscribed, 'WebSocket should be opened after connect');

    onMessageHandler(
      JSON.stringify({
        type: 'event',
        event: 'account.snapshot',
        payload: {
          account: 'DEMO',
          currency: 'USD',
          updated_at: '2024-05-01T00:00:00Z',
          fields: {},
          metrics: { NetLiquidation: 1000 }
        } satisfies AccountSummaryPayload
      })
    );

    onMessageHandler(
      JSON.stringify({
        type: 'event',
        event: 'positions.update',
        payload: {
          account: 'DEMO',
          currency: 'USD',
          updated_at: '2024-05-01T00:00:00Z',
          positions: [
            {
              account: 'DEMO',
              contract_id: null,
              symbol: 'ABC',
              exchange: 'TEST',
              sec_type: 'STK',
              currency: 'USD',
              position: 1,
              avg_cost: 10
            }
          ],
          count: 1
        } satisfies AccountPositionsPayload
      })
    );

    const summaryAction = actions.find((action) => action.type === 'account/setAccountSummary');
    const positionsAction = actions.find((action) => action.type === 'account/setPositions');
    assert(summaryAction, 'Account snapshot should dispatch summary update');
    assert(positionsAction, 'Positions update should dispatch positions update');
  } finally {
    if (client) {
      await client.disconnect();
    }
    restoreDependencies();
    timers.restore();
  }
}
