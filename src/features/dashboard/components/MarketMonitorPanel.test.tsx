import React from 'react';
import { renderToString } from 'react-dom/server';
import MarketMonitorPanel, {
  advanceTrailingSnapshot,
  resolveRiskPrice,
  selectBestTickerPrice,
  type TrailingSnapshot
} from './MarketMonitorPanel';
import { normalizeTimestampToUtc } from '../../../utils/timezone.js';
import type {
  MarketAvailability,
  MarketBar,
  MarketSubscriptionMetadata,
  MarketSubscriptionState,
  MarketTickerSnapshot,
  PositionItem,
  RiskRuleItem,
  SymbolInfo,
  TimeframeOption,
  MarketConnectionStatus
} from '../types';

const assert = (condition: unknown, message: string): void => {
  if (!condition) {
    throw new Error(message);
  }
};

const noop = () => undefined;

const baseSymbols: SymbolInfo[] = [
  { symbol: 'ES', description: 'E-mini S&P 500', exchange: 'CME' },
  { symbol: 'NQ', description: 'E-mini Nasdaq 100', exchange: 'CME' }
];

const baseTimeframes: TimeframeOption[] = [
  { value: '1m', label: '1 分钟' },
  { value: '5m', label: '5 分钟' }
];

const baseBars: MarketBar[] = [
  {
    timestamp: '2024-05-01T00:00:00Z',
    open: 4200,
    high: 4210,
    low: 4195,
    close: 4205,
    volume: 1200
  },
  {
    timestamp: '2024-05-01T00:01:00Z',
    open: 4205,
    high: 4208,
    low: 4202,
    close: 4206,
    volume: 900
  },
  {
    timestamp: '2024-05-01T00:02:00Z',
    open: 4206,
    high: 4212,
    low: 4204,
    close: 4210,
    volume: 1500
  }
];

const baseTicker: MarketTickerSnapshot = {
  symbol: 'ES',
  bid: 4205,
  ask: 4206,
  last: 4205.5,
  lastSize: 12,
  close: 4200,
  change: 5.5,
  changePercent: (5.5 / 4200) * 100,
  midPrice: 4205.5,
  spread: 1,
  updatedAt: '2024-05-01T00:02:00Z'
};

const baseAvailability: MarketAvailability = {
  symbol: 'ES',
  timeframe: '1m',
  fileCount: 12,
  totalSize: 1024,
  start: '2024-04-30T00:00:00Z',
  end: '2024-05-01T00:00:00Z',
  status: 'ready'
};

// DOM 相关测试数据已移除

const baseMetadata: MarketSubscriptionMetadata = {
  id: null,
  symbol: 'ES',
  timeframe: '1m',
  topics: ['market.dom-ES', 'market.ticker-ES']
};

const baseSubscription: MarketSubscriptionState = {
  status: 'pending',
  metadata: baseMetadata,
  error: null,
  connectionStatus: 'connecting'
};

const basePosition: PositionItem | null = null;
const baseRiskRule: RiskRuleItem | null = null;

const renderPanel = (
  connectionStatus: MarketConnectionStatus,
  subscriptionOverrides: Partial<MarketSubscriptionState>,
  subscriptionNotice?: string | null,
  tickerOverride?: Partial<MarketTickerSnapshot> | null
) => {
  const overrideMetadata = subscriptionOverrides.metadata;
  const metadata: MarketSubscriptionMetadata | null =
    overrideMetadata === undefined
      ? baseSubscription.metadata
      : overrideMetadata === null
        ? null
        : {
            ...baseSubscription.metadata!,
            ...overrideMetadata
          };

  const tickerSnapshot: MarketTickerSnapshot | null =
    tickerOverride === undefined
      ? baseTicker
      : tickerOverride === null
        ? null
        : {
            ...baseTicker,
            ...tickerOverride
          };

  const subscription: MarketSubscriptionState = {
    ...baseSubscription,
    ...subscriptionOverrides,
    metadata,
    connectionStatus
  };

  return renderToString(
    <MarketMonitorPanel
      symbols={baseSymbols}
      selectedSymbol="ES"
      timeframes={baseTimeframes}
      selectedTimeframe="1m"
      bars={baseBars}
      ticker={tickerSnapshot}
      availability={baseAvailability}
      subscription={subscription}
      connectionStatus={connectionStatus}
      subscriptionNotice={subscriptionNotice ?? null}
      monitorActive
      selectedDuration="6H"
      position={basePosition}
      riskRule={baseRiskRule}
      riskRuleSaving={false}
      onSymbolChange={noop}
      onTimeframeChange={noop}
      onToggleMonitor={noop}
      onRefresh={noop}
      onDurationChange={noop}
      onSaveRiskRule={noop}
      onToggleRiskRule={noop}
      onRetryConnection={noop}
    />
  );
};

(() => {
  const price = selectBestTickerPrice({
    symbol: 'ES',
    bid: 4_321.75,
    ask: 4_322.25,
    close: 3_900,
    last: null,
    midPrice: null
  });
  assert(price === 4_321.75, 'best price should prioritise bid when mid/last are missing');
})();

(() => {
  const markup = renderPanel('connecting', { status: 'pending', error: null });
  assert(
    markup.includes('正在连接行情 WebSocket…'),
    'connecting status should render connecting message'
  );
})();

(() => {
  const markup = renderPanel('connected', { status: 'ready', error: null });
  assert(markup.includes('风控'), 'panel should render risk control dropdown button');
})();

(() => {
  const markup = renderPanel(
    'connected',
    {
      status: 'ready',
      error: null,
    metadata: { id: 'sub-live', symbol: 'ES', timeframe: '1m', topics: ['market.ticker-ES'] }
    },
    null,
    {
      symbol: 'ES',
      bid: 4_321.75,
      ask: 4_322.25,
      last: null,
      midPrice: null,
      close: 3_900
    }
  );
  assert(
    markup.includes('4,321.75'),
    'panel should display live bid-derived price when last and mid are unavailable'
  );
})();

(() => {
  const markup = renderPanel('reconnecting', { status: 'pending', error: null });
  assert(
    markup.includes('连接中断，正在尝试重新连接…'),
    'reconnecting status should render reconnecting message'
  );
})();

(() => {
  const markup = renderPanel('failed', {
    status: 'failed',
    error: '网络错误',
    metadata: { id: null, symbol: 'ES', timeframe: '1m', topics: ['market.ticker-ES'] }
  });
  assert(
    markup.includes('行情 WebSocket 连接失败'),
    'failed status should render connection failure banner'
  );
  assert(
    markup.includes('网络错误'),
    'failed status should include error reason text'
  );
  assert(markup.includes('重试连接'), 'failed status should render retry button');
})();

(() => {
  const markup = renderPanel('connected', {
    status: 'ready',
    error: null,
    metadata: { id: 'sub-123', symbol: 'ES', timeframe: '1m', topics: ['market.dom-ES'] }
  });
  assert(markup.includes('实时订阅已激活'), 'ready status should indicate active subscription');
  assert(markup.includes('sub-123'), 'ready status should include subscription identifier');
})();

(() => {
  const normalized = normalizeTimestampToUtc('2024-06-12T05:00:00');
  assert(normalized === '2024-06-12T05:00:00.000Z', 'naive ISO timestamps should normalise to UTC');
  const normalizedWithSpace = normalizeTimestampToUtc('2024-06-12 05:00:00');
  assert(
    normalizedWithSpace === '2024-06-12T05:00:00.000Z',
    'timestamps using space separator should normalise to UTC'
  );
  const normalizedWithOffset = normalizeTimestampToUtc('2024-06-12T05:00:00+02:00');
  assert(
    normalizedWithOffset === '2024-06-12T03:00:00.000Z',
    'timestamps with offsets should convert to UTC'
  );
  const invalid = normalizeTimestampToUtc('not-a-timestamp');
  assert(invalid === null, 'invalid timestamps should return null');
})();

(() => {
  const markup = renderPanel('connected', {
    status: 'failed',
    error: '权限不足',
    metadata: { id: null, symbol: 'ES', timeframe: '1m', topics: [] }
  });
  assert(
    markup.includes('订阅失败'),
    'failed subscription with connected socket should show subscription failure message'
  );
  assert(
    markup.includes('权限不足'),
    'failed subscription message should include the subscription error reason'
  );
})();

(() => {
  const rule: RiskRuleItem = {
    id: 'rule-long',
    dbId: null,
    symbol: 'ES',
    type: 'trailing',
    enabled: true,
    trailingDistance: 0.5,
    trailingPercent: 0.4
  };
  const position: PositionItem = {
    id: 'pos-long',
    symbol: 'ES',
    direction: 'long',
    quantity: 2,
    avgPrice: 100,
    markPrice: null,
    pnl: 0,
    multiplier: 1
  };
  const prices = [100, 101.2, 100.8, 102.5, 101.7, 103, 102.2];
  let snapshot: TrailingSnapshot | null = null;
  let lastStop: number | null = null;
  for (const price of prices) {
    snapshot = advanceTrailingSnapshot(snapshot, position, price);
    const stop = resolveRiskPrice(rule, 'stopLoss', position, price, snapshot);
    const takeProfit = resolveRiskPrice(rule, 'takeProfit', position, price, snapshot);
    if (stop != null) {
      if (lastStop != null) {
        assert(stop >= lastStop - 1e-6, 'long trailing stop should not move downward');
      }
      assert(takeProfit === null, 'take profit should be null for trailing long rules');
      lastStop = stop;
    }
  }
})();

(() => {
  const rule: RiskRuleItem = {
    id: 'rule-short',
    dbId: null,
    symbol: 'ES',
    type: 'trailing',
    enabled: true,
    trailingDistance: 0.75,
    trailingPercent: 0.3
  };
  const position: PositionItem = {
    id: 'pos-short',
    symbol: 'ES',
    direction: 'short',
    quantity: -1,
    avgPrice: 150,
    markPrice: null,
    pnl: 0,
    multiplier: 1
  };
  const prices = [150, 149.2, 150.4, 148.5, 149.1, 147.8, 148.6];
  let snapshot: TrailingSnapshot | null = null;
  let lastStop: number | null = null;
  for (const price of prices) {
    snapshot = advanceTrailingSnapshot(snapshot, position, price);
    const stop = resolveRiskPrice(rule, 'stopLoss', position, price, snapshot);
    const takeProfit = resolveRiskPrice(rule, 'takeProfit', position, price, snapshot);
    if (stop != null) {
      if (lastStop != null) {
        assert(stop <= lastStop + 1e-6, 'short trailing stop should not move upward');
      }
      assert(takeProfit === null, 'take profit should be null for trailing short rules');
      lastStop = stop;
    }
  }
})();

console.log('MarketMonitorPanel connection state and trailing logic tests passed');
