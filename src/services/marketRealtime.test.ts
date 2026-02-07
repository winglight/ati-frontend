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
import { normalizePriceByTick } from '@features/dashboard/utils/priceFormatting';
import {
  normalizeBarEventPayload,
  normalizeDepthPayload,
  normalizeTickerPayload
} from './marketNormalization.js';
import { MarketRealtimeClient } from './marketRealtime.js';
import { subscribeMarketRealtimeMetrics } from './marketTelemetry.js';
import type { MarketRealtimeMetricEvent } from './marketTelemetry.js';

type NormalizeBarEventContext = Parameters<typeof normalizeBarEventPayload>[1];

const depthSnapshot = normalizeDepthPayload(
  {
    symbol: 'ES',
    bids: [
      { price: 4250.25, size: 3 },
      { price: 4250.0, size: 2 },
      { price: 4249.75, size: 1 }
    ],
    asks: [
      { price: 4250.5, size: 4 },
      { price: 4250.75, size: 5 }
    ],
    mid_price: 4250.375,
    spread: 0.25,
    timestamp: '2024-05-01T12:00:00Z'
  },
  'ES'
);

assertDeepEqual(
  depthSnapshot,
  {
    bids: [
      { price: 4250.25, size: 3 },
      { price: 4250.0, size: 2 },
      { price: 4249.75, size: 1 }
    ],
    asks: [
      { price: 4250.5, size: 4 },
      { price: 4250.75, size: 5 }
    ],
    midPrice: 4250.375,
    spread: 0.25,
    symbol: 'ES',
    updatedAt: '2024-05-01T12:00:00.000Z',
    totalBidSize: null,
    totalAskSize: null
  },
  'normalizeDepthPayload should map DOM levels into DepthSnapshot'
);

const tickerSnapshot = normalizeTickerPayload(
  {
    symbol: 'NQ',
    bid: 17500.25,
    ask: 17500.75,
    last: 17500.5,
    close: 17480.5,
    last_size: 2,
    timestamp: '2024-05-01T12:01:00Z'
  },
  'NQ'
);

assertDeepEqual(
  tickerSnapshot,
  {
    symbol: 'NQ',
    bid: 17500.25,
    ask: 17500.75,
    last: 17500.5,
    lastSize: 2,
    close: 17480.5,
    midPrice: 17500.5,
    spread: 0.5,
    change: 20,
    changePercent: (20 / 17480.5) * 100,
    updatedAt: '2024-05-01T12:01:00.000Z'
  },
  'normalizeTickerPayload should derive price deltas from payload'
);

const baseContext: NormalizeBarEventContext = {
  symbol: 'ES',
  timeframe: '5m',
  intervalSeconds: 300,
  durationSeconds: 3600
};

const snapshotResult = normalizeBarEventPayload(
  {
    symbol: 'ES',
    timeframe: '5m',
    is_snapshot: true,
    bars: [
      {
        timestamp: '2024-05-01T12:00:00.000Z',
        open: 4250,
        high: 4251,
        low: 4249.5,
        close: 4250.5,
        volume: 10
      },
      {
        timestamp: '2024-05-01T12:05:00.000Z',
        open: 4250.5,
        high: 4252,
        low: 4249.75,
        close: 4251.25,
        volume: 8
      }
    ]
  },
  baseContext
);

assert(snapshotResult && snapshotResult.snapshot, 'normalizeBarEventPayload should return snapshot');
assertDeepEqual(
  snapshotResult?.snapshot,
  {
    symbol: 'ES',
    timeframe: '5m',
    intervalSeconds: 300,
    durationSeconds: 3600,
    bars: [
      {
        timestamp: '2024-05-01T12:00:00.000Z',
        open: 4250,
        high: 4251,
        low: 4249.5,
        close: 4250.5,
        volume: 10
      },
      {
        timestamp: '2024-05-01T12:05:00.000Z',
        open: 4250.5,
        high: 4252,
        low: 4249.75,
        close: 4251.25,
        volume: 8
      }
    ],
    end: '2024-05-01T12:05:00.000Z'
  },
  'normalizeBarEventPayload should preserve bar snapshots'
);

const updateResult = normalizeBarEventPayload(
  {
    bar: {
      timestamp: '2024-05-01T12:10:00Z',
      open: 4251.25,
      high: 4252.5,
      low: 4250.75,
      close: 4252,
      volume: 7
    }
  },
  baseContext
);

assert(updateResult && updateResult.bar, 'normalizeBarEventPayload should extract incremental bar updates');
assertDeepEqual(
  updateResult,
  {
    bar: {
      timestamp: '2024-05-01T12:10:00.000Z',
      open: 4251.25,
      high: 4252.5,
      low: 4250.75,
      close: 4252,
      volume: 7
    },
    symbol: 'ES',
    timeframe: '5m',
    intervalSeconds: 300,
    durationSeconds: 3600
  },
  'normalizeBarEventPayload should include context metadata for incremental updates'
);

const normalizedAgainstHalvedReference = normalizePriceByTick(49848, 'MNQ', { reference: 24574 });
if (normalizedAgainstHalvedReference === null) {
  throw new Error('normalizePriceByTick should return a numeric value when reference is available');
}
assert(
  Math.abs(normalizedAgainstHalvedReference - 49848) < 1e-6,
  'normalizePriceByTick should not downscale prices solely due to a mismatched reference'
);

const normalizedStablePrice = normalizePriceByTick(24924, 'MNQ', { reference: 24574 });
if (normalizedStablePrice === null) {
  throw new Error('normalizePriceByTick should preserve finite prices');
}
assert(
  Math.abs(normalizedStablePrice - 24924) < 1e-6,
  'normalizePriceByTick should leave already-normalized prices untouched'
);

const normalizedAgainstExtremeReference = normalizePriceByTick(4250.25, 'ES', { reference: 21.25125 });
if (normalizedAgainstExtremeReference === null) {
  throw new Error('normalizePriceByTick should preserve prices even with extreme reference disparities');
}
assert(
  Math.abs(normalizedAgainstExtremeReference - 4250.25) < 1e-6,
  'normalizePriceByTick should ignore extreme reference deviations for valid prices'
);

const rootSymbolDepth = normalizeDepthPayload(
  {
    symbol: 'MNQ',
    best_bid_price: '17500.25',
    best_bid_size: '3',
    best_ask_price: 17500.75,
    best_ask_size: 4,
    total_bid_size: '18',
    total_ask_size: '21',
    timestamp: '2024-05-01T12:15:00Z'
  },
  'MNQM4'
);

if (!rootSymbolDepth) {
  throw new Error('normalizeDepthPayload should accept snapshots when root symbols match');
}
assert(rootSymbolDepth.symbol === 'MNQ', 'normalizeDepthPayload should preserve payload symbol');
assert(rootSymbolDepth.bids.length === 1, 'normalizeDepthPayload should include synthesized best bid level');
assert(rootSymbolDepth.asks.length === 1, 'normalizeDepthPayload should include synthesized best ask level');
const totalBidSize = rootSymbolDepth.totalBidSize ?? null;
const totalAskSize = rootSymbolDepth.totalAskSize ?? null;
assert(
  totalBidSize === 18 && totalAskSize === 21,
  'normalizeDepthPayload should propagate total sizes when provided'
);
const midPrice = rootSymbolDepth.midPrice ?? null;
assert(
  midPrice !== null && Math.abs(midPrice - 17500.5) < 1e-6,
  'normalizeDepthPayload should compute mid price from best levels'
);

const mismatchedDepth = normalizeDepthPayload(
  {
    symbol: 'CL',
    best_bid_price: 80.1,
    best_bid_size: 2,
    best_ask_price: 80.2,
    best_ask_size: 3
  },
  'MNQM4'
);

assert(mismatchedDepth === null, 'normalizeDepthPayload should ignore depth when root symbols differ');

await (async () => {
  const dispatched: AnyAction[] = [];
  const dispatch: AppDispatch = ((action: Parameters<AppDispatch>[0]) => {
    if (typeof action === 'function') {
      throw new Error('Thunk actions are not supported in this test harness');
    }
    dispatched.push(action as AnyAction);
    return action;
  }) as AppDispatch;

  const timerHost = globalContext.window as unknown as {
    setTimeout: typeof setTimeout;
    clearTimeout: typeof clearTimeout;
  };
  const originalSetTimeout = timerHost.setTimeout;
  const originalClearTimeout = timerHost.clearTimeout;
  let scheduledReconnects = 0;
  timerHost.setTimeout = ((_callback: TimerHandler, _delay?: number | string) => {
    scheduledReconnects += 1;
    return scheduledReconnects as unknown as ReturnType<typeof setTimeout>;
  }) as unknown as typeof setTimeout;
  timerHost.clearTimeout = ((_id: ReturnType<typeof setTimeout>) => {
    /* noop */
  }) as unknown as typeof clearTimeout;

  const events: MarketRealtimeMetricEvent[] = [];
  const unsubscribe = subscribeMarketRealtimeMetrics((event) => {
    events.push(event);
  });

  try {
    const client = new MarketRealtimeClient({
      dispatch,
      tokenProvider: () => 'token',
      symbolProvider: () => 'ES',
      timeframeProvider: () => '1m'
    });
    const internal = client as unknown as Record<string, unknown>;
    let disposeCalled = false;
    internal['socketHandle'] = {
      isOpen: () => true,
      send: () => true,
      dispose: () => {
        disposeCalled = true;
      }
    };
    internal['started'] = true;
    internal['lastActivityAt'] = Date.now() - 29000;
    internal['lastSubscribedSymbol'] = 'ES';
    internal['lastSubscribedTimeframe'] = '1m';
    internal['lastSubscribedTopics'] = ['market.ticker-ES'];

    const heartbeat = client as unknown as { checkHeartbeat: () => Promise<void> };
    await heartbeat.checkHeartbeat();

    assert(scheduledReconnects === 0, 'heartbeat check should not schedule reconnect before timeout');
    assert(!disposeCalled, 'heartbeat check should not dispose socket before timeout');
    assert(
      !dispatched.some(
        (action) =>
          action?.type === 'market/setMarketConnectionStatus' &&
          action.payload?.status === 'reconnecting'
      ),
      'heartbeat check should not dispatch reconnect status before timeout'
    );
    assert(!events.length, 'heartbeat check should not emit telemetry before timeout');
    assert(internal['reconnectAttempt'] === 0, 'heartbeat check should not increment reconnect attempts');
    assert(internal['reconnectTimer'] === null, 'heartbeat check should not set reconnect timer handle');
  } finally {
    timerHost.setTimeout = originalSetTimeout;
    timerHost.clearTimeout = originalClearTimeout;
    unsubscribe();
  }
})();

await (async () => {
  const dispatched: AnyAction[] = [];
  const dispatch: AppDispatch = ((action: Parameters<AppDispatch>[0]) => {
    if (typeof action === 'function') {
      throw new Error('Thunk actions are not supported in this test harness');
    }
    dispatched.push(action as AnyAction);
    return action;
  }) as AppDispatch;

  const sendPayloads: Record<string, unknown>[] = [];
  const client = new MarketRealtimeClient({
    dispatch,
    tokenProvider: () => 'token',
    symbolProvider: () => 'AAPL',
    timeframeProvider: () => '1m',
    symbolMetadataProvider: () => ({
      symbol: 'AAPL',
      description: 'Apple Inc.',
      exchange: 'NASDAQ',
      tickSize: 0.01,
      secType: 'STK',
      domCapable: false
    })
  });

  const internal = client as unknown as Record<string, unknown>;
  internal['socketHandle'] = {
    isOpen: () => true,
    send: (payload: Record<string, unknown>) => {
      sendPayloads.push(payload);
      return true;
    },
    dispose: () => {
      /* noop */
    }
  };

  const events: MarketRealtimeMetricEvent[] = [];
  const unsubscribe = subscribeMarketRealtimeMetrics((event) => {
    events.push(event);
  });

  try {
    client.refreshSubscription();
    assert(sendPayloads.length === 1, 'equity subscription should send a single subscribe payload');
    const firstPayload = sendPayloads[0] as Record<string, unknown>;
    const topics = firstPayload['topics'] as string[];
    assert(Array.isArray(topics), 'subscription payload should include topics array');
    assert(
      topics.length === 2,
      `equity subscription should request two topics, received ${topics.length}`
    );
    assert(
      topics.includes('market.ticker-AAPL') && topics.includes('market.bar-AAPL'),
      'equity subscription should retain ticker and bar topics'
    );
    assert(
      !topics.some((topic) => topic.startsWith('market.dom-') || topic.startsWith('market.depth-')),
      'equity subscription should omit DOM topics when metadata indicates no entitlement'
    );
    const metrics = events.filter((event) => event.type === 'market.realtime.subscribe.requested');
    assert(metrics.length === 1, 'subscription telemetry should emit for equity symbol');
    const [metric] = metrics;
    assert(metric?.topics?.length === 2, 'subscription telemetry should record filtered topics');
  } finally {
    unsubscribe();
  }
})();

await (async () => {
  const dispatched: AnyAction[] = [];
  const dispatch: AppDispatch = ((action: Parameters<AppDispatch>[0]) => {
    if (typeof action === 'function') {
      throw new Error('Thunk actions are not supported in this test harness');
    }
    dispatched.push(action as AnyAction);
    return action;
  }) as AppDispatch;

  const sendPayloads: Record<string, unknown>[] = [];
  const client = new MarketRealtimeClient({
    dispatch,
    tokenProvider: () => 'token',
    symbolProvider: () => 'ESM4',
    timeframeProvider: () => '1m',
    symbolMetadataProvider: () => ({
      symbol: 'ESM4',
      description: 'E-mini S&P 500 Jun 2024',
      exchange: 'CME',
      tickSize: 0.25,
      secType: 'FUT',
      domCapable: null
    })
  });

  const internal = client as unknown as Record<string, unknown>;
  internal['socketHandle'] = {
    isOpen: () => true,
    send: (payload: Record<string, unknown>) => {
      sendPayloads.push(payload);
      return true;
    },
    dispose: () => {
      /* noop */
    }
  };

  const events: MarketRealtimeMetricEvent[] = [];
  const unsubscribe = subscribeMarketRealtimeMetrics((event) => {
    events.push(event);
  });

  try {
    client.refreshSubscription();
    assert(sendPayloads.length === 1, 'futures subscription should send a single subscribe payload');
    const firstPayload = sendPayloads[0] as Record<string, unknown>;
    const topics = firstPayload['topics'] as string[];
    assert(Array.isArray(topics), 'subscription payload should include topics array');
    assert(
      topics.includes('market.dom-ESM4') && topics.includes('market.depth-ESM4'),
      'futures subscription should continue requesting DOM topics'
    );
    const metrics = events.filter((event) => event.type === 'market.realtime.subscribe.requested');
    assert(metrics.length === 1, 'subscription telemetry should emit for futures symbol');
    const [metric] = metrics;
    assert(
      metric?.topics?.includes('market.dom-ESM4') ?? false,
      'subscription telemetry should record DOM topic for futures symbol'
    );
  } finally {
    unsubscribe();
  }
})();

await (async () => {
  const dispatched: AnyAction[] = [];
  const dispatch: AppDispatch = ((action: Parameters<AppDispatch>[0]) => {
    if (typeof action === 'function') {
      throw new Error('Thunk actions are not supported in this test harness');
    }
    dispatched.push(action as AnyAction);
    return action;
  }) as AppDispatch;

  const client = new MarketRealtimeClient({
    dispatch,
    tokenProvider: () => 'token',
    symbolProvider: () => 'MNQM4',
    timeframeProvider: () => '1m',
    symbolMetadataProvider: () => ({
      symbol: 'MNQM4',
      description: 'MNQM4',
      exchange: 'CME',
      tickSize: 0.25,
      secType: 'FUT',
      domCapable: true
    })
  });

  const ackBar = {
    timestamp: '2024-05-01T12:20:00.000Z',
    open: 14789.5,
    high: 14795.75,
    low: 14788.25,
    close: 14794,
    volume: 123
  };

  const result = (client as unknown as {
    ingestAckSnapshot: (payload: unknown) => {
      depthApplied: boolean;
      tickerApplied: boolean;
      barApplied: boolean;
      historyApplied: boolean;
    };
  }).ingestAckSnapshot({
    snapshots: {
      symbol: 'MNQM4',
      timeframe: '1m',
      latest_bar: ackBar
    }
  });

  assert(result.historyApplied, 'ingestAckSnapshot should seed historical bars when latest_bar is provided');
  assert(result.barApplied, 'ingestAckSnapshot should forward latest_bar to bar handler');

  const historyAction = dispatched.find((action) => action?.type === 'market/setMarketKlineSnapshot');
  if (!historyAction) {
    throw new Error('ingestAckSnapshot should dispatch setMarketKlineSnapshot');
  }
  const historyPayload = historyAction.payload;
  if (!historyPayload) {
    throw new Error('setMarketKlineSnapshot action should contain payload');
  }
  assert(historyPayload.symbol === 'MNQM4', 'historical snapshot should retain subscription symbol');
  assert(historyPayload.timeframe === '1m', 'historical snapshot should retain timeframe context');
  assert(historyPayload.intervalSeconds === 60, 'historical snapshot should infer 1m interval');
  assert(historyPayload.durationSeconds === 60 * 60, 'historical snapshot should infer 1h duration window');
  assertDeepEqual(historyPayload.bars, [ackBar], 'historical snapshot should contain promoted latest_bar');

  const upsertAction = dispatched.find((action) => action?.type === 'market/upsertMarketBar');
  if (!upsertAction) {
    throw new Error('ingestAckSnapshot should upsert the promoted bar');
  }
  const upsertPayload = upsertAction.payload;
  if (!upsertPayload) {
    throw new Error('upsertMarketBar action should include payload');
  }
  assert(upsertPayload.symbol === 'MNQM4', 'upsertMarketBar should annotate symbol context');
  assert(upsertPayload.timeframe === '1m', 'upsertMarketBar should annotate timeframe context');
  assertDeepEqual(upsertPayload.bar, ackBar, 'upsertMarketBar should forward normalized bar');
})();

await (async () => {
  const dispatched: AnyAction[] = [];
  const dispatch: AppDispatch = ((action: Parameters<AppDispatch>[0]) => {
    if (typeof action === 'function') {
      throw new Error('Thunk actions are not supported in this test harness');
    }
    dispatched.push(action as AnyAction);
    return action;
  }) as AppDispatch;

  const client = new MarketRealtimeClient({
    dispatch,
    tokenProvider: () => 'token',
    symbolProvider: () => 'MNQM4',
    timeframeProvider: () => '1m',
    durationProvider: () => 3600
  });

  const result = (client as unknown as {
    ingestAckSnapshot: (payload: unknown) => {
      depthApplied: boolean;
      tickerApplied: boolean;
      barApplied: boolean;
      historyApplied: boolean;
    };
  }).ingestAckSnapshot({
    snapshots: {
      kline: {
        symbol: 'MNQM4',
        timeframe: '1m',
        interval_seconds: 60,
        duration_seconds: 1800,
        items: [
          {
            timestamp: '2024-05-01T12:00:00Z',
            open: 14789.5,
            high: 14795.75,
            low: 14788.25,
            close: 14794,
            volume: 123
          }
        ]
      }
    }
  });

  assert(result.historyApplied, 'kline snapshot items should be normalized into historical bars');

  const action = dispatched.find((item) => item?.type === 'market/setMarketKlineSnapshot');
  if (!action) {
    throw new Error('kline snapshot ingestion should dispatch setMarketKlineSnapshot');
  }
  const snapshot = action.payload;
  if (!snapshot) {
    throw new Error('setMarketKlineSnapshot action should contain payload');
  }
  assert(snapshot.symbol === 'MNQM4', 'kline snapshot should retain symbol context from payload');
  assert(snapshot.timeframe === '1m', 'kline snapshot should retain timeframe context from payload');
  assert(snapshot.intervalSeconds === 60, 'kline snapshot should normalize interval seconds');
  assert(snapshot.durationSeconds === 1800, 'kline snapshot should normalize duration seconds');
  assert(Array.isArray(snapshot.bars) && snapshot.bars.length === 1, 'kline snapshot should include normalized bars');
  const [bar] = snapshot.bars;
  assert(
    bar.timestamp === '2024-05-01T12:00:00Z' || bar.timestamp === '2024-05-01T12:00:00.000Z',
    'normalized bar should preserve kline timestamp'
  );
  assert(bar.open === 14789.5, 'normalized bar should retain open price');
  assert(bar.high === 14795.75, 'normalized bar should retain high price');
  assert(bar.low === 14788.25, 'normalized bar should retain low price');
  assert(bar.close === 14794, 'normalized bar should retain close price');
  assert(bar.volume === 123, 'normalized bar should retain volume');
})();

await (async () => {
  const dispatched: AnyAction[] = [];
  const dispatch: AppDispatch = ((action: Parameters<AppDispatch>[0]) => {
    if (typeof action === 'function') {
      throw new Error('Thunk actions are not supported in this test harness');
    }
    dispatched.push(action as AnyAction);
    return action;
  }) as AppDispatch;

  const client = new MarketRealtimeClient({
    dispatch,
    tokenProvider: () => 'token',
    symbolProvider: () => 'MNQM4',
    timeframeProvider: () => '1m'
  });

  const duplicateBars = [
    {
      timestamp: '2024-05-01T12:00:00Z',
      open: 14789.5,
      high: 14795.75,
      low: 14788.25,
      close: 14794,
      volume: 123
    },
    {
      timestamp: '2024-05-01T12:00:00+00:00',
      open: 14789.5,
      high: 14795.75,
      low: 14788.25,
      close: 14794,
      volume: 123
    }
  ];

  const result = (client as unknown as {
    ingestAckSnapshot: (payload: unknown) => {
      depthApplied: boolean;
      tickerApplied: boolean;
      barApplied: boolean;
      historyApplied: boolean;
    };
  }).ingestAckSnapshot({
    snapshots: {
      kline: {
        symbol: 'MNQM4',
        timeframe: '1m',
        items: duplicateBars
      }
    }
  });

  assert(
    result.historyApplied,
    'historical snapshot should be applied when kline items are provided'
  );

  const action = dispatched.find((item) => item?.type === 'market/setMarketKlineSnapshot');
  if (!action) {
    throw new Error('historical snapshot ingestion should dispatch setMarketKlineSnapshot');
  }
  const snapshot = action.payload;
  if (!snapshot) {
    throw new Error('setMarketKlineSnapshot action should include payload');
  }

  assert(Array.isArray(snapshot.bars), 'historical snapshot should include bars array');
  assert(
    snapshot.bars.length === 1,
    'historical snapshot should deduplicate bars with equivalent timestamps'
  );
  const [dedupedBar] = snapshot.bars;
  assert(dedupedBar, 'historical snapshot should include at least one bar');
  assert(
    dedupedBar.timestamp === '2024-05-01T12:00:00.000Z',
    'historical bar timestamp should be normalized to UTC'
  );
})();

void (async () => {
  const dispatched: AnyAction[] = [];
  const dispatch: AppDispatch = ((action: Parameters<AppDispatch>[0]) => {
    if (typeof action === 'function') {
      throw new Error('Thunk actions are not supported in this test harness');
    }
    dispatched.push(action as AnyAction);
    return action;
  }) as AppDispatch;

  const client = new MarketRealtimeClient({
    dispatch,
    tokenProvider: () => 'token',
    symbolProvider: () => 'ES',
    timeframeProvider: () => '1m'
  });

  const internal = client as unknown as Record<string, unknown>;
  internal['started'] = true;
  let disposeCount = 0;
  internal['socketHandle'] = {
    isOpen: () => true,
    send: () => true,
    dispose: () => {
      disposeCount += 1;
    }
  };

  const ackHandler = client as unknown as {
    handleSubscribeAck: (payload: unknown) => Promise<void>;
  };

  const events: MarketRealtimeMetricEvent[] = [];
  const unsubscribe = subscribeMarketRealtimeMetrics((event) => {
    events.push(event);
  });

  try {
    await ackHandler.handleSubscribeAck({
      action: 'subscribe',
      topics: ['market.ticker-ES'],
      symbol: 'ES',
      timeframe: '1m',
      error: '订阅拒绝'
    });
  } finally {
    unsubscribe();
  }

  const statusAction = dispatched.find((action) => action.type === 'market/setMarketConnectionStatus');
  if (!statusAction) {
    throw new Error('connection failure should dispatch connection status update');
  }
  assert(statusAction.payload?.status === 'failed', 'connection status should be marked as failed');
  const failureAction = dispatched.find((action) => action.type === 'market/setMarketSubscriptionFailed');
  if (!failureAction) {
    throw new Error('subscription failure action should be dispatched');
  }
  assert(disposeCount === 1, 'socket handle should be disposed after subscription failure');
  assert(internal['started'] === false, 'client should stop after subscription failure');
  const failureEvent = events.find((event) => event.type === 'market.realtime.subscribe.failed');
  if (!failureEvent) {
    throw new Error('subscription failure should emit telemetry event');
  }
  assert(failureEvent.symbol === 'ES', 'telemetry failure event should include symbol context');
  assert(failureEvent.timeframe === '1m', 'telemetry failure event should include timeframe context');
  assert(failureEvent.error === '订阅拒绝', 'telemetry failure event should include failure reason');
})();


(() => {
  const dispatched: AnyAction[] = [];
  const dispatch: AppDispatch = ((action: Parameters<AppDispatch>[0]) => {
    if (typeof action === 'function') {
      throw new Error('Thunk actions are not supported in this test harness');
    }
    dispatched.push(action as AnyAction);
    return action;
  }) as AppDispatch;

  const sendPayloads: Record<string, unknown>[] = [];
  const client = new MarketRealtimeClient({
    dispatch,
    tokenProvider: () => 'token',
    symbolProvider: () => 'ES',
    timeframeProvider: () => '1m'
  });

  const internal = client as unknown as Record<string, unknown>;
  internal['socketHandle'] = {
    isOpen: () => true,
    send: (payload: Record<string, unknown>) => {
      sendPayloads.push(payload);
      return true;
    },
    dispose: () => {
      /* noop */
    }
  };

  const events: MarketRealtimeMetricEvent[] = [];
  const unsubscribe = subscribeMarketRealtimeMetrics((event) => {
    events.push(event);
  });

  try {
    client.refreshSubscription();
    assert(sendPayloads.length === 1, 'refreshSubscription should send initial subscribe payload');
    const firstPayload = sendPayloads[0] as Record<string, unknown>;
    assertDeepEqual(
      firstPayload['topics'],
      ['market.dom-ES', 'market.depth-ES', 'market.ticker-ES', 'market.bar-ES'],
      'subscription payload should include symbol-specific topics'
    );
    const requestEvents = events.filter((event) => event.type === 'market.realtime.subscribe.requested');
    assert(requestEvents.length === 1, 'subscription request should emit telemetry event exactly once');
    const firstEvent = requestEvents[0];
    assert(firstEvent?.symbol === 'ES', 'telemetry event should include subscription symbol');
    assert(firstEvent?.timeframe === '1m', 'telemetry event should include subscription timeframe');

    client.refreshSubscription();
    assert(
      sendPayloads.length === 1,
      'refreshSubscription should not resend subscription when parameters unchanged'
    );
    const requestEventsAfterNoop = events.filter(
      (event) => event.type === 'market.realtime.subscribe.requested'
    );
    assert(
      requestEventsAfterNoop.length === 1,
      'subscription telemetry should not fire when parameters do not change'
    );

    internal['timeframeProvider'] = () => '5m';
    client.refreshSubscription();
    assert(
      sendPayloads.length === 2,
      'refreshSubscription should send new subscription when timeframe changes'
    );
    const secondPayload = sendPayloads[1] as Record<string, unknown>;
    assert(
      secondPayload['timeframe'] === '5m',
      'subscription payload should include updated timeframe when parameters change'
    );
    const requestEventsAfterChange = events.filter(
      (event) => event.type === 'market.realtime.subscribe.requested'
    );
    assert(
      requestEventsAfterChange.length === 2,
      'subscription telemetry should record the second request after timeframe change'
    );
    const secondEvent = requestEventsAfterChange[1];
    assert(secondEvent?.timeframe === '5m', 'second telemetry event should record updated timeframe');
  } finally {
    unsubscribe();
  }
})();

await (async () => {
  const dispatched: AnyAction[] = [];
  const dispatch: AppDispatch = ((action: Parameters<AppDispatch>[0]) => {
    if (typeof action === 'function') {
      throw new Error('Thunk actions are not supported in this test harness');
    }
    dispatched.push(action as AnyAction);
    return action;
  }) as AppDispatch;

  const sendPayloads: Record<string, unknown>[] = [];
  const timerHost = globalContext.window as unknown as {
    setTimeout: typeof setTimeout;
    clearTimeout: typeof clearTimeout;
  };
  const timeouts: number[] = [];
  const originalSetTimeout = timerHost.setTimeout;
  const originalClearTimeout = timerHost.clearTimeout;
  timerHost.setTimeout = ((_callback: TimerHandler, delay?: number | string) => {
    timeouts.push(Number(delay ?? 0));
    return timeouts.length as number;
  }) as typeof setTimeout;
  timerHost.clearTimeout = ((_id: ReturnType<typeof setTimeout>) => {
    /* noop */
  }) as typeof clearTimeout;

  const events: MarketRealtimeMetricEvent[] = [];
  const unsubscribe = subscribeMarketRealtimeMetrics((event) => {
    events.push(event);
  });

  try {
    const client = new MarketRealtimeClient({
      dispatch,
      tokenProvider: () => 'token',
      symbolProvider: () => 'ES',
      timeframeProvider: () => '1m'
    });
    const internal = client as unknown as Record<string, unknown>;
    let disposeCalled = false;
    internal['socketHandle'] = {
      isOpen: () => true,
      send: (payload: Record<string, unknown>) => {
        sendPayloads.push(payload);
        return true;
      },
      dispose: () => {
        disposeCalled = true;
      }
    };
    internal['started'] = true;
    internal['lastActivityAt'] = Date.now() - 60000;
    internal['lastSubscribedSymbol'] = 'ES';
    internal['lastSubscribedTimeframe'] = '1m';
    internal['lastSubscribedTopics'] = ['market.ticker-ES'];

    const heartbeat = client as unknown as { checkHeartbeat: () => Promise<void> };
    await heartbeat.checkHeartbeat();
    assert(disposeCalled, 'heartbeat timeout should dispose existing socket before reconnecting');
    assert(
      sendPayloads.length === 0,
      'heartbeat timeout should schedule a reconnect instead of resending subscription payloads'
    );
    assert(timeouts.length === 1, 'heartbeat timeout should schedule exactly one reconnect timer');
    assert(timeouts[0] === 1000, 'first reconnect attempt should use 1s backoff delay');
    assert(
      dispatched.some(
        (action) =>
          action?.type === 'market/setMarketConnectionStatus' &&
          action.payload?.status === 'reconnecting'
      ),
      'heartbeat timeout should dispatch reconnecting connection status'
    );
    assert(
      internal['reconnectAttempt'] === 1,
      'heartbeat timeout should increment reconnect attempt counter'
    );
    assert(
      typeof internal['reconnectTimer'] === 'number',
      'heartbeat timeout should retain reconnect timer handle'
    );
    const heartbeatEvent = events.find((event) => event.type === 'market.realtime.heartbeat_timeout');
    if (!heartbeatEvent) {
      throw new Error('heartbeat timeout should emit telemetry event');
    }
    assert(
      heartbeatEvent.inactivityMs >= 60000,
      'heartbeat telemetry should include inactivity duration'
    );
    assert(heartbeatEvent.symbol === 'ES', 'heartbeat telemetry should include symbol context');
    assert(heartbeatEvent.timeframe === '1m', 'heartbeat telemetry should include timeframe context');
    const reconnectEvent = events.find((event) => event.type === 'market.realtime.reconnect_scheduled');
    if (!reconnectEvent) {
      throw new Error('heartbeat timeout should schedule reconnect telemetry event');
    }
    assert(reconnectEvent.attempt === 1, 'reconnect telemetry should record attempt count');
    assert(reconnectEvent.delayMs === 1000, 'reconnect telemetry should include backoff delay');
  } finally {
    timerHost.setTimeout = originalSetTimeout;
    timerHost.clearTimeout = originalClearTimeout;
    unsubscribe();
  }
})();

await (async () => {
  const dispatched: AnyAction[] = [];
  const dispatch: AppDispatch = ((action: Parameters<AppDispatch>[0]) => {
    if (typeof action === 'function') {
      throw new Error('Thunk actions are not supported in this test harness');
    }
    dispatched.push(action as AnyAction);
    return action;
  }) as AppDispatch;

  const client = new MarketRealtimeClient({
    dispatch,
    tokenProvider: () => 'token',
    symbolProvider: () => 'ES',
    timeframeProvider: () => '1m'
  });

  const internal = client as unknown as Record<string, unknown>;
  const sendPayloads: Record<string, unknown>[] = [];
  internal['socketHandle'] = {
    isOpen: () => true,
    send: (payload: Record<string, unknown>) => {
      sendPayloads.push(payload);
      return true;
    },
    dispose: () => {
      /* noop */
    }
  };
  internal['started'] = true;

  const ackHandler = client as unknown as {
    handleSubscribeAck: (payload: unknown) => Promise<void>;
  };

  const events: MarketRealtimeMetricEvent[] = [];
  const unsubscribe = subscribeMarketRealtimeMetrics((event) => {
    events.push(event);
  });

  const originalDateNow = Date.now;
  try {
    Date.now = () => 1000;
    client.refreshSubscription();
    Date.now = () => 1600;
    await ackHandler.handleSubscribeAck({
      action: 'subscribe',
      topics: ['market.ticker-ES'],
      symbol: 'ES',
      timeframe: '1m',
      ok: true
    });
  } finally {
    Date.now = originalDateNow;
    unsubscribe();
  }

  const ackEvent = events.find((event) => event.type === 'market.realtime.subscribe.ack');
  if (!ackEvent) {
    throw new Error('subscription ACK should emit telemetry event');
  }
  assert(ackEvent.symbol === 'ES', 'ACK telemetry should include symbol context');
  assert(ackEvent.timeframe === '1m', 'ACK telemetry should include timeframe context');
  assert(ackEvent.latencyMs === 600, 'ACK telemetry should record subscribe latency');
  const readyAction = dispatched.find((action) => action.type === 'market/setMarketSubscriptionReady');
  if (!readyAction) {
    throw new Error('subscription ACK should dispatch readiness update');
  }
  assertDeepEqual(
    readyAction.payload?.topics,
    ['market.ticker-ES'],
    'subscription readiness payload should include server-confirmed topics'
  );
  assertDeepEqual(
    internal['lastSubscribedTopics'],
    ['market.ticker-ES'],
    'client should retain server-confirmed topic list after ACK'
  );
  const requestEvents = events.filter((event) => event.type === 'market.realtime.subscribe.requested');
  assert(requestEvents.length === 1, 'subscription request telemetry should only fire once before ACK');
})();

(() => {
  const dispatched: AnyAction[] = [];
  const dispatch: AppDispatch = ((action: Parameters<AppDispatch>[0]) => {
    if (typeof action === 'function') {
      throw new Error('Thunk actions are not supported in this test harness');
    }
    dispatched.push(action as AnyAction);
    return action;
  }) as AppDispatch;

  const client = new MarketRealtimeClient({
    dispatch,
    tokenProvider: () => 'token',
    symbolProvider: () => 'ES',
    timeframeProvider: () => '1m'
  });

  const internal = client as unknown as Record<string, unknown>;
  internal['lastSubscribedSymbol'] = 'ES';

  const handler = client as unknown as { handleEvent: (payload: unknown) => void };
  handler.handleEvent({
    event: 'market.ticker-NQ',
    payload: {
      symbol: 'NQ',
      bid: 15100.25,
      ask: 15100.5,
      last: 15100.25,
      close: 15090.25,
      timestamp: '2024-05-01T12:34:56Z'
    }
  });

  const toastAction = dispatched.find((action) => action.type === 'toast/addToast');
  if (!toastAction) {
    throw new Error('mismatched event should dispatch toast notification');
  }
  assert(
    toastAction.payload?.preventDuplicates === true,
    'toast notification should enable duplicate prevention'
  );
  assert(toastAction.payload?.variant === 'error', 'toast notification should use error variant');
  assert(
    typeof toastAction.payload?.message === 'string' && toastAction.payload.message.includes('NQ'),
    'toast message should reference observed symbol'
  );
  assert(
    !dispatched.some((action) => action.type === 'market/setTickerSnapshot'),
    'mismatched event should not dispatch ticker updates'
  );
})();

(() => {
  const dispatched: AnyAction[] = [];
  const dispatch: AppDispatch = ((action: Parameters<AppDispatch>[0]) => {
    if (typeof action === 'function') {
      throw new Error('Thunk actions are not supported in this test harness');
    }
    dispatched.push(action as AnyAction);
    return action;
  }) as AppDispatch;

  const client = new MarketRealtimeClient({
    dispatch,
    tokenProvider: () => 'token',
    symbolProvider: () => 'ES',
    timeframeProvider: () => '1m'
  });

  const internal = client as unknown as Record<string, unknown>;
  internal['lastSubscribedSymbol'] = 'ES';

  const handler = client as unknown as { handleEvent: (payload: unknown) => void };
  handler.handleEvent({
    event: 'market.ticker-ES',
    payload: {
      symbol: 'ES',
      bid: 4300.25,
      ask: 4300.5,
      last: 4300.25,
      close: 4298.75,
      timestamp: '2024-05-01T12:35:56Z'
    }
  });

  const tickerAction = dispatched.find((action) => action.type === 'market/setTickerSnapshot');
  if (!tickerAction) {
    throw new Error('matching event should dispatch ticker snapshot');
  }
  assert(
    tickerAction.payload?.symbol === 'ES',
    'ticker snapshot payload should preserve symbol context'
  );
  assert(
    !dispatched.some((action) => action.type === 'toast/addToast'),
    'matching event should not emit toast notification'
  );
})();

(() => {
  const dispatched: AnyAction[] = [];
  const dispatch: AppDispatch = ((action: Parameters<AppDispatch>[0]) => {
    if (typeof action === 'function') {
      throw new Error('Thunk actions are not supported in this test harness');
    }
    dispatched.push(action as AnyAction);
    return action;
  }) as AppDispatch;

  const client = new MarketRealtimeClient({
    dispatch,
    tokenProvider: () => 'token',
    symbolProvider: () => 'ES',
    timeframeProvider: () => '1m'
  });

  const internal = client as unknown as Record<string, unknown>;
  internal['lastSubscribedSymbol'] = 'ES';

  const handler = client as unknown as { handleEvent: (payload: unknown) => void };
  handler.handleEvent({
    event: 'market.ticker-ES',
    payload: {
      symbol: 'ESM4',
      bid: 4300.25,
      ask: 4300.5,
      last: 4300.25,
      close: 4298.75,
      timestamp: '2024-05-01T12:35:56Z'
    }
  });

  const tickerAction = dispatched.find((action) => action.type === 'market/setTickerSnapshot');
  if (!tickerAction) {
    throw new Error('month symbol ticker event should dispatch ticker snapshot');
  }
  assert(
    tickerAction.payload?.symbol === 'ES',
    'ticker snapshot should normalize month symbols to subscribed root symbol'
  );
  const pricingAction = dispatched.find((action) => action.type === 'account/updatePositionPricing');
  if (!pricingAction) {
    throw new Error('month symbol ticker event should dispatch position pricing update');
  }
  assert(
    pricingAction.payload?.symbol === 'ES',
    'position pricing updates should target the subscribed root symbol when month symbols arrive'
  );
})();

console.log('marketRealtime normalization helpers tests passed');
