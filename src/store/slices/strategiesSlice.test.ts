import type { ActiveSubscriptionSummaryPayload } from '@services/marketApi';
import reducer, {
  setMarketDataSubscriptions,
  setMarketDataSubscriptionsStatus,
  setMarketDataSubscriptionsStreamingEnabled
} from './strategiesSlice';

const assert = (condition: unknown, message: string): void => {
  if (!condition) {
    throw new Error(message);
  }
};

const createBaseState = () => reducer(undefined, { type: '@@INIT' } as never);

(() => {
  const baseState = createBaseState();
  assert(
    Array.isArray(baseState.marketDataSubscriptions.items),
    'marketDataSubscriptions should provide an items array in the initial state'
  );
  assert(
    baseState.marketDataSubscriptions.status === 'idle',
    'marketDataSubscriptions should default to idle status'
  );
  assert(
    baseState.marketDataSubscriptions.error === null,
    'marketDataSubscriptions should default to null error'
  );
  assert(
    baseState.marketDataSubscriptions.updatedAt === null,
    'marketDataSubscriptions should start without an updated timestamp'
  );
  assert(
    baseState.marketDataSubscriptions.streamingEnabled === true,
    'marketDataSubscriptions should enable streaming by default'
  );
})();

(() => {
  const baseState = createBaseState();
  const subscriptions = [
    {
      subscriptionId: 'sub-1',
      symbol: 'AAPL',
      enableDom: true,
      ownerCount: 1,
      streams: [
        {
          subscriptionId: 'sub-1',
          streamType: 'dom',
          enabled: true,
          ownerCount: 1,
          totalReferences: null,
          subscribers: []
        }
      ]
    },
    {
      subscriptionId: 'sub-2',
      symbol: 'ES',
      enableBars: false,
      streams: []
    }
  ];
  const telemetry = { source: 'ws', durationMs: 42 };
  const updatedAt = '2024-07-01T08:30:00.000Z';
  const nextState = reducer(
    baseState,
    setMarketDataSubscriptions({
      items: subscriptions as ActiveSubscriptionSummaryPayload[],
      telemetry,
      updatedAt,
      error: null
    })
  );
  assert(
    nextState.marketDataSubscriptions.items.length === 2,
    'setMarketDataSubscriptions should persist the provided list of subscriptions'
  );
  assert(
    nextState.marketDataSubscriptions.items[0]?.subscriptionId === 'sub-1',
    'setMarketDataSubscriptions should store entries verbatim'
  );
  assert(
    nextState.marketDataSubscriptions.telemetry?.source === 'ws',
    'setMarketDataSubscriptions should record telemetry metadata'
  );
  assert(
    nextState.marketDataSubscriptions.updatedAt === updatedAt,
    'setMarketDataSubscriptions should record the updated timestamp'
  );
  assert(
    nextState.marketDataSubscriptions.error === null,
    'setMarketDataSubscriptions should allow clearing previous errors'
  );
  const followUp = reducer(
    nextState,
    setMarketDataSubscriptions({ telemetry: { source: 'follow-up' } })
  );
  assert(
    followUp.marketDataSubscriptions.items === nextState.marketDataSubscriptions.items,
    'setMarketDataSubscriptions should preserve existing items when no replacement list is provided'
  );
  assert(
    followUp.marketDataSubscriptions.telemetry?.source === 'follow-up',
    'setMarketDataSubscriptions should update telemetry independently of items'
  );
})();

(() => {
  const baseState = createBaseState();
  const updatingState = reducer(
    baseState,
    setMarketDataSubscriptionsStatus({ status: 'updating' })
  );
  assert(
    updatingState.marketDataSubscriptions.status === 'updating',
    'setMarketDataSubscriptionsStatus should update the loading flag'
  );
  assert(
    updatingState.marketDataSubscriptions.error === null,
    'setMarketDataSubscriptionsStatus should retain prior errors when none provided'
  );
  const erroredState = reducer(
    updatingState,
    setMarketDataSubscriptionsStatus({ status: 'idle', error: 'failed to sync' })
  );
  assert(
    erroredState.marketDataSubscriptions.status === 'idle',
    'setMarketDataSubscriptionsStatus should allow returning to idle state'
  );
  assert(
    erroredState.marketDataSubscriptions.error === 'failed to sync',
    'setMarketDataSubscriptionsStatus should capture provided error messages'
  );
})();

(() => {
  const baseState = createBaseState();
  const disabled = reducer(
    baseState,
    setMarketDataSubscriptionsStreamingEnabled(false)
  );
  assert(
    disabled.marketDataSubscriptions.streamingEnabled === false,
    'streaming toggle should disable websocket updates when requested'
  );
  const restored = reducer(
    disabled,
    setMarketDataSubscriptionsStreamingEnabled(true)
  );
  assert(
    restored.marketDataSubscriptions.streamingEnabled === true,
    'streaming toggle should re-enable websocket updates when requested'
  );
})();
