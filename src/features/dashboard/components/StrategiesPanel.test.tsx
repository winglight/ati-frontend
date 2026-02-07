import React from 'react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { JSDOM } from 'jsdom';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import StrategiesPanel from './StrategiesPanel';
import strategiesReducer from '@store/slices/strategiesSlice';
import toastReducer from '@store/slices/toastSlice';
import { resyncStrategySubscription } from '@store/thunks/strategies';
import type { StrategyItem, StrategyRuntimeDetail } from '../types';

type StrategiesState = ReturnType<typeof strategiesReducer>;
type ToastState = ReturnType<typeof toastReducer>;
type TestStore = ReturnType<typeof createStore>;

type ResyncOutcome =
  | { type: 'success'; message?: string; refreshed?: boolean }
  | { type: 'error'; message: string };

const assert = (condition: unknown, message: string): void => {
  if (!condition) {
    throw new Error(message);
  }
};

const baseStrategy: StrategyItem = {
  id: 'dom-demo',
  name: 'DOM Demo',
  symbol: 'ES',
  status: 'running',
  mode: 'live',
  returnRate: 0,
  enabled: true,
  active: true,
  tags: null,
  dataSource: 'market-data:push',
  filePath: null,
  strategyOrigin: 'internal',
  templateId: null,
  schedule: null,
  parameters: null,
  metricsSnapshot: null,
  performanceSnapshot: null,
  lastUpdatedAt: null,
  lastSignal: null,
  triggerCount: null,
  lastTriggeredAt: null
};

const runtimeDetail: StrategyRuntimeDetail = {
  strategyId: baseStrategy.id,
  status: { active: true, enabled: true },
  snapshot: {
    summary: {
      is_receiving_data: false,
      awaiting_data: false,
      data_label: 'DOM',
      data_push_reason: 'Coordinator refresh pending',
      data_push_cause: 'Missing DOM stream',
      data_push_cause_code: 'subscription_failed',
      signals_processed: 0,
      signals_success: 0,
      buy_signals: 0,
      sell_signals: 0,
      runtime_seconds: 180
    },
    data_push: {
      status_reason: 'Coordinator refresh pending',
      status_cause: 'Missing DOM stream',
      status_cause_code: 'subscription_failed',
      symbol: 'ES',
      last_data_timestamp: '2024-06-01T00:00:00Z'
    },
    logs: [
      {
        id: 'warn-1',
        level: 'WARN',
        tone: 'warning',
        timestamp: '2024-06-01T00:00:00Z',
        message: 'DOM stream inactive; awaiting coordinator refresh',
        details: []
      }
    ],
    refreshedAt: '2024-06-01T00:00:00Z'
  },
  triggerCount: 0,
  lastTriggeredAt: null
};

const baseStrategiesState: StrategiesState = strategiesReducer(undefined, { type: '@@INIT' } as never);
const baseToastState: ToastState = toastReducer(undefined, { type: '@@INIT' } as never);

function createStore(config?: { resyncStatus?: StrategiesState['subscriptionResyncStatus'][string]; resyncError?: string | undefined }) {
  const strategiesState: StrategiesState = {
    ...baseStrategiesState,
    items: [baseStrategy],
    subscriptionResyncStatus: {
      ...baseStrategiesState.subscriptionResyncStatus,
      [baseStrategy.id]: config?.resyncStatus ?? 'idle'
    },
    subscriptionResyncError: {
      ...baseStrategiesState.subscriptionResyncError,
      [baseStrategy.id]: config?.resyncError
    }
  };
  const toastState: ToastState = {
    ...baseToastState,
    items: []
  };
  return configureStore({
    reducer: { strategies: strategiesReducer, toast: toastReducer },
    preloadedState: { strategies: strategiesState, toast: toastState }
  });
}

type StoreDispatch = TestStore['dispatch'];

type LifecycleMeta = { arg: { strategyId: string } };

function installResyncMock(store: TestStore, outcomes: ResyncOutcome[]) {
  const originalDispatch: StoreDispatch = store.dispatch;
  const invocations: LifecycleMeta['arg'][] = [];
  let outcomeIndex = 0;

  const dispatchLifecycle = <Payload,>(
    meta: LifecycleMeta,
    params: { payload?: Payload; error?: { message: string } }
  ) => {
    originalDispatch({ type: resyncStrategySubscription.pending.type, meta });
    if (params.error) {
      const rejectedAction = {
        type: resyncStrategySubscription.rejected.type,
        error: { message: params.error.message },
        meta
      };
      originalDispatch(rejectedAction);
      const rejection = Promise.reject(
        Object.assign(new Error(params.error.message), { action: rejectedAction })
      ) as Promise<never> & { unwrap: () => Promise<never> };
      rejection.unwrap = () =>
        Promise.reject(
          Object.assign(new Error(params.error?.message ?? 'Rejected'), { action: rejectedAction })
        );
      return rejection;
    }
    if (params.payload === undefined) {
      throw new Error('Missing payload for resync success');
    }
    const fulfilledAction = {
      type: resyncStrategySubscription.fulfilled.type,
      payload: params.payload,
      meta
    };
    originalDispatch(fulfilledAction);
    const promise = Promise.resolve(fulfilledAction) as Promise<typeof fulfilledAction> & {
      unwrap: () => Promise<Payload>;
    };
    promise.unwrap = () => Promise.resolve(params.payload as Payload);
    return promise;
  };

  store.dispatch = ((action: unknown) => {
    if (typeof action === 'function') {
      const thunk = action as { typePrefix?: string; arg?: { strategyId: string } };
      if (thunk.typePrefix === resyncStrategySubscription.typePrefix) {
        const arg = thunk.arg ?? { strategyId: baseStrategy.id };
        const meta = { arg };
        invocations.push(arg);
        const outcome = outcomes[Math.min(outcomeIndex, outcomes.length - 1)];
        outcomeIndex += 1;
        if (outcome.type === 'success') {
          const payload = {
            id: arg.strategyId,
            strategy: baseStrategy.name,
            refreshed: outcome.refreshed ?? true,
            message: outcome.message ?? 'Subscription refresh triggered'
          };
          return dispatchLifecycle(meta, { payload });
        }
        return dispatchLifecycle(meta, { error: { message: outcome.message } });
      }
      return (thunk as (
        dispatch: StoreDispatch,
        getState: TestStore['getState'],
        extra: unknown
      ) => unknown)(store.dispatch, store.getState, undefined);
    }
    return originalDispatch(action as never);
  }) as StoreDispatch;

  return { invocations };
}

function renderPanel(store: TestStore) {
  return render(
    <Provider store={store}>
      <StrategiesPanel
        strategies={[baseStrategy]}
        onInspect={() => undefined}
        onEdit={() => undefined}
        onToggle={() => undefined}
        onCreate={() => undefined}
        runtimeById={{ [baseStrategy.id]: runtimeDetail }}
      />
    </Provider>
  );
}

(async () => {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' });

  const previousWindow = (globalThis as { window?: Window }).window;
  const previousDocument = (globalThis as { document?: Document }).document;
  const previousNavigator = (globalThis as { navigator?: Navigator }).navigator;
  const previousMutationObserver = (globalThis as {
    MutationObserver?: typeof MutationObserver;
  }).MutationObserver;
  const previousHTMLElement = (globalThis as { HTMLElement?: typeof HTMLElement }).HTMLElement;
  const previousNode = (globalThis as { Node?: typeof Node }).Node;
  const previousGetComputedStyle = (globalThis as {
    getComputedStyle?: typeof getComputedStyle;
  }).getComputedStyle;

  (globalThis as { window?: Window }).window = dom.window as unknown as Window;
  (globalThis as { document?: Document }).document = dom.window.document as unknown as Document;
  Object.defineProperty(globalThis, 'navigator', {
    value: dom.window.navigator,
    writable: true,
    configurable: true
  });
  (globalThis as { MutationObserver?: typeof MutationObserver }).MutationObserver = dom.window
    .MutationObserver as unknown as typeof MutationObserver;
  (globalThis as { HTMLElement?: typeof HTMLElement }).HTMLElement = dom.window
    .HTMLElement as unknown as typeof HTMLElement;
  (globalThis as { Node?: typeof Node }).Node = dom.window.Node as unknown as typeof Node;
  (globalThis as { getComputedStyle?: typeof getComputedStyle }).getComputedStyle =
    dom.window.getComputedStyle.bind(dom.window);

  try {
    {
      const store = createStore();
      const view = renderPanel(store);
      try {
        await waitFor(() => {
          const button = screen.getByRole('button', {
            name: /Coordinator refresh pending/i
          });
          assert(button instanceof HTMLButtonElement, 'Runtime status should render as a button when data feed is off');
          assert(!button.disabled, 'Idle resync control should be enabled');
        });
      } finally {
        view.unmount();
        cleanup();
      }
    }

    {
      const store = createStore();
      const resyncMock = installResyncMock(store, [
        { type: 'success', message: 'Subscription refresh triggered' }
      ]);
      const view = renderPanel(store);
      try {
        const user = userEvent.setup();
        const button = await waitFor(() =>
          screen.getByRole('button', { name: /Coordinator refresh pending/i })
        );
        await user.click(button);
        await waitFor(() => {
          assert(resyncMock.invocations.length === 1, 'Resync button should dispatch the resync thunk');
        });
        await waitFor(() => {
          const items = store.getState().toast.items;
          assert(
            items.some(
              (item) =>
                item.message === 'Subscription refresh triggered' && item.variant === 'success'
            ),
            'Successful resync should queue a success toast'
          );
        });
      } finally {
        view.unmount();
        cleanup();
      }
    }

    {
      const store = createStore({ resyncStatus: 'loading' });
      const view = renderPanel(store);
      try {
        await waitFor(() => {
          const button = screen.getByRole('button', { name: '刷新中…' });
          assert(button instanceof HTMLButtonElement, 'Pending state should still render the button element');
          assert(button.disabled, 'Pending resync should disable the runtime button');
        });
      } finally {
        view.unmount();
        cleanup();
      }
    }

    {
      const store = createStore();
      const resyncMock = installResyncMock(store, [
        { type: 'error', message: 'Coordinator rejected refresh' }
      ]);
      const view = renderPanel(store);
      try {
        const user = userEvent.setup();
        const button = await waitFor(() =>
          screen.getByRole('button', { name: /Coordinator refresh pending/i })
        );
        await user.click(button);
        await waitFor(() => {
          assert(resyncMock.invocations.length === 1, 'Failure path should still dispatch the resync thunk');
        });
        await waitFor(() => {
          const items = store.getState().toast.items;
          assert(
            items.some(
              (item) =>
                item.message === 'Coordinator rejected refresh' && item.variant === 'error'
            ),
            'Rejected resync should enqueue an error toast'
          );
        });
      } finally {
        view.unmount();
        cleanup();
      }
    }

    console.log('StrategiesPanel runtime resync tests passed');
  } finally {
    cleanup();
    if (previousWindow === undefined) {
      delete (globalThis as { window?: Window }).window;
    } else {
      (globalThis as { window?: Window }).window = previousWindow;
    }
    if (previousDocument === undefined) {
      delete (globalThis as { document?: Document }).document;
    } else {
      (globalThis as { document?: Document }).document = previousDocument;
    }
    if (previousNavigator === undefined) {
      delete (globalThis as { navigator?: Navigator }).navigator;
    } else {
      Object.defineProperty(globalThis, 'navigator', {
        value: previousNavigator,
        writable: true,
        configurable: true
      });
    }
    if (previousMutationObserver === undefined) {
      delete (globalThis as { MutationObserver?: typeof MutationObserver }).MutationObserver;
    } else {
      (globalThis as { MutationObserver?: typeof MutationObserver }).MutationObserver = previousMutationObserver;
    }
    if (previousHTMLElement === undefined) {
      delete (globalThis as { HTMLElement?: typeof HTMLElement }).HTMLElement;
    } else {
      (globalThis as { HTMLElement?: typeof HTMLElement }).HTMLElement = previousHTMLElement;
    }
    if (previousNode === undefined) {
      delete (globalThis as { Node?: typeof Node }).Node;
    } else {
      (globalThis as { Node?: typeof Node }).Node = previousNode;
    }
    if (previousGetComputedStyle === undefined) {
      delete (globalThis as { getComputedStyle?: typeof getComputedStyle }).getComputedStyle;
    } else {
      (globalThis as { getComputedStyle?: typeof getComputedStyle }).getComputedStyle = previousGetComputedStyle;
    }
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
