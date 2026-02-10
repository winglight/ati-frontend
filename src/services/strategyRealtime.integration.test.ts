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

import type { RootState } from '@store/index';
import type { StrategyItem, StrategyPerformanceSnapshot } from '@features/dashboard/types';
import { StrategyRealtimeClient } from './strategyRealtime';

interface CloseEventLike {
  code: number;
  wasClean: boolean;
  reason?: string;
}

interface RecordedAction {
  type: string;
  payload: unknown;
}

const createStrategyItem = (overrides: Partial<StrategyItem> & { id: string }): StrategyItem => ({
  id: overrides.id,
  name: overrides.name ?? overrides.id,
  symbol: overrides.symbol ?? '--',
  status: overrides.status ?? 'stopped',
  mode: overrides.mode ?? 'paper',
  returnRate: overrides.returnRate ?? 0,
  lastSignal: overrides.lastSignal ?? null,
  description: overrides.description ?? null,
  templateId: overrides.templateId ?? null,
  schedule: overrides.schedule ?? null,
  parameters: overrides.parameters ?? null,
  metricsSnapshot: overrides.metricsSnapshot ?? null,
  performanceSnapshot: overrides.performanceSnapshot ?? null,
  lastUpdatedAt: overrides.lastUpdatedAt ?? null,
  enabled: overrides.enabled ?? true,
  active: overrides.active ?? false,
  tags: overrides.tags ?? null,
  dataSource: overrides.dataSource ?? null,
  strategyOrigin: overrides.strategyOrigin ?? null,
  triggerCount: overrides.triggerCount ?? null,
  lastTriggeredAt: overrides.lastTriggeredAt ?? null
});

const waitForMicrotask = () => new Promise((resolve) => setTimeout(resolve, 0));

const createBaseRootState = (): RootState => {
  const basePerformanceSnapshot = {
    summary: { totalPnl: 420 },
    orders: [],
    totalOrders: 0,
    page: 2,
    pageSize: 25,
    hasNext: false,
    updatedAt: '2024-05-01T00:00:00Z',
    period: 'month',
    charts: {
      cumulativePnl: [],
      drawdown: [],
      distribution: [],
      winLoss: []
    },
    calendar: null
  };
  return {
    strategies: {
      items: [
        createStrategyItem({
          id: 'alpha-id',
          name: 'Alpha',
          status: 'running',
          mode: 'live',
          triggerCount: 4,
          lastTriggeredAt: '2024-05-01T00:00:00Z',
          performanceSnapshot: basePerformanceSnapshot
        })
      ],
      status: 'succeeded',
      error: undefined,
      selectedId: 'alpha-id',
      metrics: { 'alpha-id': null },
      performance: {
        'alpha-id': { [basePerformanceSnapshot.period]: basePerformanceSnapshot }
      },
      operations: {},
      fallbackMode: 'websocket',
      templates: [],
      templatesStatus: 'idle',
      files: [],
      filesStatus: 'idle',
      saveStatus: 'idle',
      saveError: null,
      details: {},
      detailStatus: {},
      detailError: {},
      runtime: {},
      runtimeStatus: {},
      runtimeError: {},
      risk: {},
      riskStatus: {},
      riskError: {},
      riskLogs: {},
      riskLogsStatus: {},
      riskLogsError: {},
      summaryStatus: {},
      summaryError: {},
      riskSaveStatus: {},
      riskSaveError: {},
      candles: { 'alpha-id': null },
      candlesStatus: { 'alpha-id': 'succeeded' },
      candlesError: {},
      candlesRequest: { 'alpha-id': { interval: '5m', intervalSeconds: 300 } },
      parameterStatus: {},
      parameterError: {},
      marketDataSubscriptions: {
        items: [],
        status: 'idle',
        error: null,
        updatedAt: null,
        telemetry: undefined,
        streamingEnabled: true
      }
    }
  } as unknown as RootState;
};

const recordDispatch = (state: RootState, actions: RecordedAction[]): ((action: unknown) => void) => {
  const reduceStrategies = (action: RecordedAction) => {
    switch (action.type) {
      case 'strategies/updateStrategyStatus': {
        const payload = action.payload as { id: string; changes: Partial<StrategyItem> };
        const sanitizedChanges: Partial<StrategyItem> = { ...payload.changes };
        if (sanitizedChanges.performanceSnapshot === null) {
          delete sanitizedChanges.performanceSnapshot;
        }
        if (sanitizedChanges.metricsSnapshot === null) {
          delete sanitizedChanges.metricsSnapshot;
        }
        const index = state.strategies.items.findIndex((item) => item.id === payload.id);
        if (index === -1) {
          state.strategies.items.push(createStrategyItem({ id: payload.id, ...sanitizedChanges }));
        } else {
          state.strategies.items[index] = createStrategyItem({
            ...state.strategies.items[index],
            ...sanitizedChanges,
            id: payload.id
          });
        }
        break;
      }
      case 'strategies/setStrategyMetrics': {
        const payload = action.payload as { id: string; metrics: unknown };
        state.strategies.metrics[payload.id] = payload.metrics as never;
        break;
      }
      case 'strategies/setStrategyPerformance': {
        const payload = action.payload as {
          id: string;
          performance: StrategyPerformanceSnapshot | null;
          period?: string;
        };
        const period = payload.period ?? payload.performance?.period ?? 'day';
        const entry = (state.strategies.performance[payload.id] ??= {} as never) as Record<
          string,
          StrategyPerformanceSnapshot | null
        >;
        entry[period] = payload.performance ?? null;
        break;
      }
      case 'strategies/setStrategyCandles': {
        const payload = action.payload as {
          id: string;
          candles: unknown;
          request?: { interval: string; intervalSeconds?: number | null } | null;
        };
        state.strategies.candles[payload.id] = payload.candles as never;
        if (payload.request) {
          state.strategies.candlesRequest[payload.id] = payload.request;
        }
        break;
      }
      case 'strategies/setStrategies': {
        const payload = action.payload as StrategyItem[];
        state.strategies.items = payload.map((item) => createStrategyItem(item));
        if (!state.strategies.selectedId && state.strategies.items.length > 0) {
          state.strategies.selectedId = state.strategies.items[0].id;
        }
        break;
      }
      case 'strategies/setStrategyFallbackMode': {
        state.strategies.fallbackMode = action.payload as 'websocket' | 'http-polling';
        break;
      }
      case 'strategies/setMarketDataSubscriptions': {
        const payload = action.payload as {
          items?: unknown[];
          updatedAt?: string | null;
          telemetry?: Record<string, unknown>;
          error?: string | null;
        };
        if (payload.items !== undefined) {
          state.strategies.marketDataSubscriptions.items = payload.items as never;
        }
        if (payload.updatedAt !== undefined) {
          state.strategies.marketDataSubscriptions.updatedAt = payload.updatedAt;
        }
        if (payload.telemetry !== undefined) {
          state.strategies.marketDataSubscriptions.telemetry = payload.telemetry;
        }
        if (payload.error !== undefined) {
          state.strategies.marketDataSubscriptions.error = payload.error;
        }
        break;
      }
      case 'strategies/setMarketDataSubscriptionsStatus': {
        const payload = action.payload as { status: 'idle' | 'updating'; error?: string | null };
        state.strategies.marketDataSubscriptions.status = payload.status;
        if (payload.error !== undefined) {
          state.strategies.marketDataSubscriptions.error = payload.error;
        }
        break;
      }
      default:
        break;
    }
  };

  return (action: unknown) => {
    const typed = action as RecordedAction;
    actions.push(typed);
    reduceStrategies(typed);
  };
};

const dependenciesFactory = () => {
  const subscribeInvocations: {
    onOpen?: (event: unknown) => void;
    onMessage?: (payload: string) => void;
    onClose?: (event: CloseEventLike) => void;
    messages: Record<string, unknown>[];
  }[] = [];

  type SubscribeWebSocket = typeof import('./websocketHub').subscribeWebSocket;

  const subscribeWebSocket = ((options: Parameters<SubscribeWebSocket>[0]) => {
    const record = {
      onOpen: options.onOpen as unknown as (event: unknown) => void,
      onMessage: options.onMessage,
      onClose: options.onClose as unknown as (event: CloseEventLike) => void,
      messages: [] as Record<string, unknown>[]
    };
    subscribeInvocations.push(record);
    return {
      send: (message: Record<string, unknown>) => {
        record.messages.push(message);
        return true;
      },
      isOpen: () => true,
      dispose: () => undefined
    };
  }) as SubscribeWebSocket;

  return {
    subscribeWebSocket,
    subscribeInvocations
  };
};

const createCloseEvent = (code: number): CloseEventLike => ({ code, wasClean: false });

const runSelectedStrategyRefreshScenario = async () => {
  const actions: RecordedAction[] = [];
  const state = createBaseRootState();
  const { subscribeWebSocket, subscribeInvocations } = dependenciesFactory();
  let performanceCalls = 0;
  let candlesCalls = 0;
  let listCalls = 0;

  const client = new StrategyRealtimeClient({
    dispatch: recordDispatch(state, actions) as never,
    tokenProvider: () => 'token-123',
    stateProvider: () => state,
    dependencies: {
      subscribeWebSocket,
      getStrategyPerformanceSummary: async () => {
        performanceCalls += 1;
        return {
          summary: { totalPnl: 840 },
          orders: [],
          totalOrders: 0,
          page: 2,
          pageSize: 25,
          hasNext: false,
          updatedAt: '2024-05-01T00:01:00Z',
          period: 'month',
          charts: {
            cumulativePnl: [
              { timestamp: '2024-05-01T00:00:00Z', value: 0 },
              { timestamp: '2024-05-01T00:05:00Z', value: 100 }
            ],
            drawdown: [],
            distribution: [],
            winLoss: []
          },
          calendar: null
        };
      },
      getStrategyMetricsSnapshot: async () => ({
        metrics: { sharpe: 1.2 },
        updatedAt: '2024-05-01T00:01:00Z',
        period: 'month'
      }),
      getStrategyCandlesSnapshot: async () => {
        candlesCalls += 1;
        return {
          symbol: 'ESM4',
          interval: '5m',
          intervalSeconds: 300,
          refreshedAt: '2024-05-01T00:05:00Z',
          candles: [
            {
              timestamp: '2024-05-01T00:00:00Z',
              open: 4200,
              high: 4210,
              low: 4195,
              close: 4205,
              volume: 10
            }
          ],
          signals: []
        };
      },
      listStrategiesMapped: async () => {
        listCalls += 1;
        return state.strategies.items;
      }
    }
  });

  await client.connect();
  assert(subscribeInvocations.length === 1, 'should subscribe to websocket once on connect');
  const subscription = subscribeInvocations[0];
  subscription.onOpen?.(undefined);
  assert(
    actions.some((action) => action.type === 'strategies/setStrategyFallbackMode' && action.payload === 'websocket'),
    'should switch to websocket mode when socket opens'
  );

  const baselinePerformanceCalls = performanceCalls;
  const baselineCandlesCalls = candlesCalls;

  subscription.onMessage?.(
    JSON.stringify({
      type: 'event',
      event: 'strategy.status',
      payload: {
        id: 'alpha-id',
        strategy_id: 'alpha',
        metrics_updated_at: '2024-05-01T00:01:00Z'
      }
    })
  );

  const strategyAfterStatus = state.strategies.items.find((item) => item.id === 'alpha-id');
  assertDeepEqual(
    strategyAfterStatus?.performanceSnapshot?.summary,
    { totalPnl: 420 },
    'status updates without performance data should preserve existing summary'
  );

  await waitForMicrotask();
  await waitForMicrotask();

  assert(
    performanceCalls === baselinePerformanceCalls + 1,
    'should refresh performance when receiving status update'
  );
  assert(
    candlesCalls === baselineCandlesCalls,
    'status updates should not trigger candles HTTP refresh'
  );

  const performanceAction = actions.find((action) => action.type === 'strategies/setStrategyPerformance');
  assert(performanceAction !== undefined, 'should dispatch performance action after refresh');
  const candlesAction = actions.find((action) => action.type === 'strategies/setStrategyCandles');
  assert(candlesAction === undefined, 'status updates should not dispatch candles snapshot actions');

  const fallbackAction = actions.find(
    (action) => action.type === 'strategies/setStrategyFallbackMode' && action.payload === 'http-polling'
  );
  assert(fallbackAction === undefined, 'fallback should remain websocket while socket is open');

  subscription.onClose?.(createCloseEvent(1006));
  await waitForMicrotask();
  await waitForMicrotask();

  const closedFallbackAction = actions.find(
    (action) => action.type === 'strategies/setStrategyFallbackMode' && action.payload === 'http-polling'
  );
  assert(closedFallbackAction !== undefined, 'should enter http polling when socket closes unexpectedly');
  assert(listCalls === 0, 'socket close should not trigger legacy list polling');

  await client.disconnect();

  const finalPerformanceMap = state.strategies.performance['alpha-id'] ?? {};
  const finalPerformance = finalPerformanceMap['month'];
  assert(finalPerformance !== undefined, 'state should keep refreshed performance');
  assertDeepEqual(
    finalPerformance,
    {
      summary: { totalPnl: 840 },
      orders: [],
      totalOrders: 0,
      page: 2,
      pageSize: 25,
      hasNext: false,
      updatedAt: '2024-05-01T00:01:00Z',
      period: 'month',
      charts: {
        cumulativePnl: [
          { timestamp: '2024-05-01T00:00:00Z', value: 0 },
          { timestamp: '2024-05-01T00:05:00Z', value: 100 }
        ],
        drawdown: [],
        distribution: [],
        winLoss: []
      },
      calendar: null
    },
    'state should persist refreshed performance snapshot'
  );

  const finalCandles = state.strategies.candles['alpha-id'];
  assert(finalCandles === null, 'state should keep existing candles snapshot when status updates arrive');
};

const runDashboardModalRefreshScenario = async () => {
  const actions: RecordedAction[] = [];
  const state = createBaseRootState();
  state.strategies.selectedId = null;
  state.strategies.items.push(
    createStrategyItem({
      id: 'beta-id',
      name: 'Beta',
      status: 'running',
      mode: 'live',
      performanceSnapshot: null,
      metricsSnapshot: null
    })
  );
  const basePerformance = {
    summary: { totalPnl: 120 },
    orders: [],
    totalOrders: 0,
    page: 1,
    pageSize: 50,
    hasNext: false,
    updatedAt: '2024-05-01T00:00:00Z',
    period: 'day',
    charts: { cumulativePnl: [], drawdown: [], distribution: [], winLoss: [] },
    calendar: null
  };
  state.strategies.performance['beta-id'] = {
    [basePerformance.period]: basePerformance
  } as never;
  state.strategies.details['beta-id'] = null as never;

  const { subscribeWebSocket, subscribeInvocations } = dependenciesFactory();
  let performanceCalls = 0;

  const client = new StrategyRealtimeClient({
    dispatch: recordDispatch(state, actions) as never,
    tokenProvider: () => 'token-123',
    stateProvider: () => state,
    dependencies: {
      subscribeWebSocket,
      getStrategyPerformanceSummary: async () => {
        performanceCalls += 1;
        return {
          summary: { totalPnl: 360 },
          orders: [],
          totalOrders: 0,
          page: 1,
          pageSize: 50,
          hasNext: false,
          updatedAt: '2024-05-01T00:02:00Z',
          period: 'day',
          charts: {
            cumulativePnl: [
              { timestamp: '2024-05-01T00:00:00Z', value: 0 },
              { timestamp: '2024-05-01T00:01:00Z', value: 240 }
            ],
            drawdown: [],
            distribution: [],
            winLoss: []
          },
          calendar: null
        };
      },
      getStrategyCandlesSnapshot: async () => {
        throw new Error('candles should not be fetched when no request exists');
      },
      listStrategiesMapped: async () => state.strategies.items
    }
  });

  await client.connect();
  const subscription = subscribeInvocations[0];
  subscription.onOpen?.(undefined);

  const baselinePerformanceCalls = performanceCalls;

  subscription.onMessage?.(
    JSON.stringify({
      type: 'event',
      event: 'strategy.status',
      payload: {
        id: 'beta-id',
        strategy_id: 'beta',
        metrics_updated_at: '2024-05-01T00:02:00Z'
      }
    })
  );

  await waitForMicrotask();
  await waitForMicrotask();

  assert(
    performanceCalls === baselinePerformanceCalls + 1,
    'detail modal should trigger performance refresh without selection'
  );

  const modalPerformanceMap = state.strategies.performance['beta-id'] ?? {};
  const modalPerformance = modalPerformanceMap['day'];
  assertDeepEqual(
    modalPerformance,
    {
      summary: { totalPnl: 360 },
      orders: [],
      totalOrders: 0,
      page: 1,
      pageSize: 50,
      hasNext: false,
      updatedAt: '2024-05-01T00:02:00Z',
      period: 'day',
      charts: {
        cumulativePnl: [
          { timestamp: '2024-05-01T00:00:00Z', value: 0 },
          { timestamp: '2024-05-01T00:01:00Z', value: 240 }
        ],
        drawdown: [],
        distribution: [],
        winLoss: []
      },
      calendar: null
    },
    'modal performance should be replaced with refreshed snapshot'
  );

  await client.disconnect();
};

const runMarketDataSubscriptionScenario = async () => {
  const actions: RecordedAction[] = [];
  const state = createBaseRootState();
  const { subscribeWebSocket, subscribeInvocations } = dependenciesFactory();
  let listCalls = 0;

  const client = new StrategyRealtimeClient({
    dispatch: recordDispatch(state, actions) as never,
    tokenProvider: () => 'token-123',
    stateProvider: () => state,
    dependencies: {
      subscribeWebSocket,
      listStrategiesMapped: async () => {
        listCalls += 1;
        return state.strategies.items;
      }
    }
  });

  await client.connect();
  assert(subscribeInvocations.length === 1, 'should open websocket connection for market data');
  const subscription = subscribeInvocations[0];
  subscription.onOpen?.(undefined);

  const subscribeMessage = subscription.messages[0];
  assert(subscribeMessage !== undefined, 'should emit subscribe payload when socket opens');
  const topicsCandidate = (subscribeMessage as Record<string, unknown>).topics;
  const topics = Array.isArray(topicsCandidate) ? topicsCandidate : [];
  assert(
    topics.includes('strategy.market_data'),
    'subscribe payload should include strategy.market_data topic'
  );

  const liveSubscriptions = [
    {
      subscription_id: 'sub-1',
      symbol: 'ESM4',
      timeframe: '1m',
      enable_dom: true,
      enable_ticker: true,
      enable_bars: true,
      started_at: '2024-05-01T00:10:00Z',
      owner_count: 2,
      owners: ['alpha', 'beta'],
      metadata: { venue: 'cme' },
      bar_subscribers: [
        { owner_id: 'gamma', reference_count: 3 },
        { owner_id: 'delta', reference_count: null }
      ],
      streams: [
        {
          subscription_id: 'sub-1',
          stream_type: 'dom',
          enabled: true,
          owner_count: 2,
          total_references: null,
          subscribers: [
            { owner_id: 'alpha', reference_count: 1 },
            { owner_id: 'beta', reference_count: 1 }
          ]
        }
      ]
    }
  ];

  subscription.onMessage?.(
    JSON.stringify({
      type: 'event',
      event: 'strategy.market_data',
      timestamp: '2024-05-01T00:15:00Z',
      payload: {
        subscriptions: liveSubscriptions,
        telemetry: { source: 'ws', sequence: 1 },
        status: 'updating',
        updated_at: '2024-05-01T00:15:00Z'
      }
    })
  );

  const subscriptionState = state.strategies.marketDataSubscriptions;
  assert(subscriptionState.status === 'updating', 'market data status should reflect payload');
  assertDeepEqual(
    subscriptionState.items,
    [
      {
        subscriptionId: 'sub-1',
        symbol: 'ESM4',
        timeframe: '1m',
        enableDom: true,
        enableTicker: true,
        enableBars: false,
        startedAt: '2024-05-01T00:10:00Z',
        ownerCount: 2,
        owners: ['alpha', 'beta'],
        metadata: { venue: 'cme' },
        streams: [
          {
            subscriptionId: 'sub-1',
            streamType: 'dom',
            enabled: true,
            ownerCount: 2,
            totalReferences: null,
            metadata: undefined,
            subscribers: [
              { ownerId: 'alpha', referenceCount: 1, metadata: undefined },
              { ownerId: 'beta', referenceCount: 1, metadata: undefined }
            ]
          },
          {
            subscriptionId: 'sub-1',
            streamType: 'bars',
            enabled: true,
            ownerCount: 2,
            totalReferences: 3,
            metadata: undefined,
            subscribers: [
              { ownerId: 'gamma', referenceCount: 3, metadata: undefined },
              { ownerId: 'delta', referenceCount: null, metadata: undefined }
            ]
          }
        ]
      }
    ],
    'market data subscriptions should mirror websocket payload entries'
  );
  assertDeepEqual(
    subscriptionState.telemetry,
    { source: 'ws', sequence: 1 },
    'market data telemetry should update from payload'
  );
  assert(
    subscriptionState.updatedAt === '2024-05-01T00:15:00Z',
    'market data timestamp should originate from payload'
  );
  assert(subscriptionState.error === null, 'market data payload without errors should clear prior errors');
  assert(listCalls === 0, 'market data updates should not trigger legacy list polling');
  const unexpectedFallback = actions.find(
    (action) =>
      action.type === 'strategies/setStrategyFallbackMode' && action.payload === 'http-polling'
  );
  assert(unexpectedFallback === undefined, 'market data events should not force HTTP fallback');

  const retainedItems = subscriptionState.items;
  subscription.onMessage?.(
    JSON.stringify({
      type: 'event',
      event: 'strategy.market_data',
      timestamp: '2024-05-01T00:16:00Z',
      payload: {
        status: 'idle',
        error: 'feed disconnected',
        telemetry: { source: 'ws', sequence: 2 }
      }
    })
  );

  const errorState = state.strategies.marketDataSubscriptions;
  assert(errorState.items === retainedItems, 'error payloads should retain prior subscription list');
  assert(errorState.status === 'idle', 'market data status should downgrade to idle after error');
  assert(errorState.error === 'feed disconnected', 'market data error message should propagate');
  assertDeepEqual(
    errorState.telemetry,
    { source: 'ws', sequence: 2 },
    'market data telemetry should refresh with error payloads'
  );
  assert(
    errorState.updatedAt === '2024-05-01T00:16:00Z',
    'error payload should rely on event timestamp when updatedAt missing'
  );

  await client.disconnect();
};

const runManualMarketDataScenario = async () => {
  const actions: RecordedAction[] = [];
  const state = createBaseRootState();
  state.strategies.marketDataSubscriptions.streamingEnabled = false;
  const { subscribeWebSocket, subscribeInvocations } = dependenciesFactory();

  const client = new StrategyRealtimeClient({
    dispatch: recordDispatch(state, actions) as never,
    tokenProvider: () => 'token-manual',
    stateProvider: () => state,
    dependencies: {
      subscribeWebSocket,
      listStrategiesMapped: async () => state.strategies.items
    }
  });

  await client.connect();
  const subscription = subscribeInvocations[0];
  subscription.onOpen?.(undefined);

  subscription.onMessage?.(
    JSON.stringify({
      type: 'event',
      event: 'strategy.market_data',
      timestamp: '2024-05-01T00:20:00Z',
      payload: {
        subscriptions: [
          {
            subscription_id: 'manual-1',
            symbol: 'CLM4',
            enable_dom: true,
            streams: [
              {
                subscription_id: 'manual-1',
                stream_type: 'dom',
                enabled: true,
                owner_count: 1,
                subscribers: [{ owner_id: 'ops', reference_count: 1 }]
              }
            ]
          }
        ],
        telemetry: { source: 'ws', sequence: 99 },
        status: 'updating',
        updated_at: '2024-05-01T00:20:00Z'
      }
    })
  );

  const subscriptionState = state.strategies.marketDataSubscriptions;
  assert(
    subscriptionState.items.length === 0,
    'manual mode should ignore websocket deltas when streaming is disabled'
  );
  const dispatchedUpdate = actions.some(
    (action) => action.type === 'strategies/setMarketDataSubscriptions'
  );
  assert(!dispatchedUpdate, 'manual mode should avoid dispatching subscription updates');

  await client.disconnect();
};

(async () => {
  await runSelectedStrategyRefreshScenario();
  await runDashboardModalRefreshScenario();
  await runMarketDataSubscriptionScenario();
  await runManualMarketDataScenario();
  console.log('Strategy realtime integration tests passed');
})();
