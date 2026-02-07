import { useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import StrategyDetailPanel from '@features/strategies/components/StrategyDetailPanel';
import type { StrategyFallbackMode, StrategyItem } from '@features/dashboard/types';
import { useAppDispatch, useAppSelector } from '@store/hooks';
import { setToken } from '@store/slices/authSlice';
import { selectStrategy, setStrategies } from '@store/slices/strategiesSlice';

type StrategyDetailTab = 'summary' | 'risk' | 'orders' | 'visual' | 'candles' | 'calendar';

const DEFAULT_STRATEGY: StrategyItem = {
  id: 'strategy-e2e',
  name: 'E2E Momentum',
  symbol: 'ETH-USD',
  status: 'running',
  mode: 'paper',
  returnRate: 0.23,
  lastSignal: 'buy',
  description: 'Test harness strategy for browser automation',
  templateId: 'momentum',
  schedule: null,
  parameters: [
    {
      name: 'lookback',
      label: 'Lookback',
      type: 'number',
      value: 12,
      defaultValue: 10,
      description: 'Number of periods for signal generation'
    },
    {
      name: 'threshold',
      label: 'Threshold',
      type: 'number',
      value: 1.5,
      defaultValue: 1,
      description: 'Trigger threshold'
    }
  ],
  metricsSnapshot: null,
  performanceSnapshot: null,
  lastUpdatedAt: new Date().toISOString(),
  enabled: true,
  active: true,
  tags: ['test'],
  dataSource: 'market-data',
  strategyOrigin: 'internal',
  triggerCount: 88,
  lastTriggeredAt: new Date().toISOString()
};

const AVAILABLE_TABS = new Set<StrategyDetailTab>([
  'summary',
  'risk',
  'orders',
  'visual',
  'candles',
  'calendar'
]);

function StrategyDetailE2EPage() {
  const dispatch = useAppDispatch();
  const [params] = useSearchParams();
  const searchKey = params.toString();

  const initialStrategy = useMemo(() => {
    const searchParams = new URLSearchParams(searchKey);
    const overrideId = searchParams.get('strategyId');
    const overrideName = searchParams.get('name');
    const overrideSymbol = searchParams.get('symbol');
    return {
      ...DEFAULT_STRATEGY,
      id: overrideId ?? DEFAULT_STRATEGY.id,
      name: overrideName ?? DEFAULT_STRATEGY.name,
      symbol: overrideSymbol ?? DEFAULT_STRATEGY.symbol
    };
  }, [searchKey]);

  const initialTab = useMemo(() => {
    const searchParams = new URLSearchParams(searchKey);
    const tabParam = searchParams.get('tab');
    if (!tabParam) {
      return undefined;
    }
    return AVAILABLE_TABS.has(tabParam as StrategyDetailTab)
      ? (tabParam as StrategyDetailTab)
      : undefined;
  }, [searchKey]);

  useEffect(() => {
    dispatch(setToken('test-token'));
  }, [dispatch]);

  useEffect(() => {
    dispatch(setStrategies([initialStrategy]));
    dispatch(selectStrategy(initialStrategy.id));
  }, [dispatch, initialStrategy]);

  const strategy = useAppSelector((state) =>
    state.strategies.items.find((item) => item.id === initialStrategy.id) ?? null
  );
  const metrics = useAppSelector((state) =>
    strategy ? state.strategies.metrics[strategy.id] ?? null : null
  );
  const performance = useAppSelector((state) => {
    if (!strategy) {
      return null;
    }
    const periods = state.strategies.performance[strategy.id] ?? null;
    if (!periods) {
      return null;
    }
    return periods['day'] ?? Object.values(periods).find((snapshot) => snapshot) ?? null;
  });
  const fallbackMode = useAppSelector<StrategyFallbackMode>(
    (state) => state.strategies.fallbackMode
  );

  if (!strategy) {
    return <div data-testid="strategy-e2e-loading">策略初始化中...</div>;
  }

  return (
    <div style={{ padding: '24px' }}>
      <StrategyDetailPanel
        strategy={strategy}
        metrics={metrics}
        performance={performance}
        fallbackMode={fallbackMode}
        initialTab={initialTab}
      />
    </div>
  );
}

declare global {
  interface Window {
    __ALGOTRADER_SKIP_AUTH__?: boolean;
  }
}

export default StrategyDetailE2EPage;
