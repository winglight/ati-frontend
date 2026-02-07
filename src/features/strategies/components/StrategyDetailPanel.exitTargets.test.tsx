import '../../../tests/domShim';

import React from 'react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { cleanup, render, screen } from '@testing-library/react';
import StrategyDetailPanel from './StrategyDetailPanel';
import strategiesReducer, { selectStrategy, setStrategies } from '@store/slices/strategiesSlice';
import authReducer from '@store/slices/authSlice';
import { loadStrategyCandles, loadStrategyDetail } from '@store/thunks/strategies';
import type {
  StrategyCandlesSnapshot,
  StrategyDetailSummary,
  StrategyItem,
  StrategyRiskSettings,
  StrategyRuntimeDetail
} from '@features/dashboard/types';

const assert = (condition: unknown, message: string): asserts condition => {
  if (!condition) {
    throw new Error(message);
  }
};

const buildStore = () =>
  configureStore({
    reducer: {
      strategies: strategiesReducer,
      auth: authReducer
    }
  });

const baseExitConfig = [
  { name: 'exit_mode', value: 'fixed_rr' },
  { name: 'risk_amount', value: 100 },
  { name: 'rr_ratio', value: 2 }
];

const riskDefaults: StrategyRiskSettings = {
  strategyId: '',
  forbidPyramiding: false,
  notifyOnBreach: false
};

const baseStrategy: StrategyItem = {
  id: 'runtime-targets',
  name: 'Runtime Targets',
  symbol: 'ES',
  status: 'running',
  mode: 'paper',
  returnRate: 0,
  triggerCount: 0,
  lastTriggeredAt: null,
  description: 'Strategy using runtime positions',
  schedule: null,
  parameters: [],
  dataSource: 'market-data:push',
  strategyOrigin: 'internal',
  isKlineStrategy: false
};

const buildDetail = (
  exitConfig = baseExitConfig,
  overrides: Partial<StrategyDetailSummary> = {}
): StrategyDetailSummary => ({
  id: overrides.id ?? baseStrategy.id,
  name: overrides.name ?? baseStrategy.name,
  strategyType: overrides.strategyType ?? 'dom',
  dataSource: overrides.dataSource ?? 'market-data:push',
  description: overrides.description ?? baseStrategy.description,
  primarySymbol: overrides.primarySymbol ?? baseStrategy.symbol,
  schedule: overrides.schedule ?? null,
  exit_config: exitConfig,
  parameters: overrides.parameters ?? {},
  parameterDefinitions: overrides.parameterDefinitions ?? []
});

const renderPanelWithRuntime = (
  runtime: StrategyRuntimeDetail,
  options?: {
    exitConfig?: Array<Record<string, unknown>>;
    strategyOverrides?: Partial<StrategyItem>;
    detailOverrides?: Partial<StrategyDetailSummary>;
    candles?: StrategyCandlesSnapshot;
  }
) => {
  const store = buildStore();
  const strategy = { ...baseStrategy, ...(options?.strategyOverrides ?? {}) };
  const detail = buildDetail(options?.exitConfig, {
    id: strategy.id,
    name: strategy.name,
    primarySymbol: strategy.symbol,
    ...options?.detailOverrides
  });
  const risk: StrategyRiskSettings = { ...riskDefaults, strategyId: strategy.id };
  store.dispatch(setStrategies([strategy]));
  store.dispatch(selectStrategy(strategy.id));
  store.dispatch({
    type: loadStrategyDetail.fulfilled.type,
    payload: { id: strategy.id, detail, runtime, risk }
  });

  if (options?.candles) {
    const request = { strategyId: strategy.id, interval: options.candles.interval ?? '5m' };
    store.dispatch({
      type: loadStrategyCandles.fulfilled.type,
      payload: { id: strategy.id, candles: options.candles },
      meta: { arg: request }
    });
  }

  render(
    <Provider store={store}>
      <StrategyDetailPanel
        strategy={store.getState().strategies.items[0] ?? null}
        metrics={null}
        performance={null}
        fallbackMode={store.getState().strategies.fallbackMode}
      />
    </Provider>
  );
};

afterEach(cleanup);

describe('StrategyDetailPanel exit targets', () => {
  it('computes runtime targets for long and short positions', () => {
    renderPanelWithRuntime({
      strategyId: baseStrategy.id,
      status: { active: true, enabled: true },
      snapshot: {
        summary: {
          position_side: 'long',
          position_size: 2,
          avg_entry_price: 1500
        }
      },
      triggerCount: 0,
      lastTriggeredAt: null
    });

    assert(screen.getByText('Stop Loss Price'), 'should render stop loss label');
    assert(screen.getByText('$1,450.00'), 'should compute stop loss from runtime position');
    assert(screen.getByText('Take Profit Price'), 'should render take profit label');
    assert(screen.getByText('$1,600.00'), 'should compute take profit from runtime position');

    cleanup();

    renderPanelWithRuntime({
      strategyId: baseStrategy.id,
      status: { active: true, enabled: true },
      snapshot: {
        summary: {
          position_side: 'short',
          position_size: -4,
          average_price: 2000
        }
      },
      triggerCount: 0,
      lastTriggeredAt: null
    });

    assert(screen.getByText('$2,025.00'), 'should move stop loss above entry for shorts');
    assert(screen.getByText('$1,950.00'), 'should move take profit below entry for shorts');
  });

  it('keeps ATR-based targets when RR ratio is absent', () => {
    const atrCandles: StrategyCandlesSnapshot = {
      symbol: 'ES',
      interval: '5m',
      intervalSeconds: 300,
      candles: [
        { timestamp: 1, open: 100, high: 110, low: 90, close: 105, volume: 1000 },
        { timestamp: 2, open: 105, high: 115, low: 95, close: 110, volume: 1000 }
      ]
    };

    renderPanelWithRuntime(
      {
        strategyId: 'atr-targets',
        status: { active: true, enabled: true },
        snapshot: {
          summary: {
            position_side: 'long',
            position_size: 1,
            avg_entry_price: 130
          }
        },
        triggerCount: 0,
        lastTriggeredAt: null
      },
      {
        strategyOverrides: {
          id: 'atr-targets',
          name: 'ATR Targets',
          isKlineStrategy: true,
          strategyType: 'kline',
          dataSource: 'market-data:kline'
        },
        detailOverrides: {
          strategyType: 'kline',
          dataSource: 'market-data:kline',
          isKlineStrategy: true
        },
        exitConfig: [
          { name: 'exit_mode', value: 'atr' },
          { name: 'atr_length', value: 2 },
          { name: 'atr_multiplier', value: 1.5 }
        ],
        candles: atrCandles
      }
    );

    assert(screen.getByText('$100.00'), 'should offset stop loss from ATR');
    assert(screen.getByText('$160.00'), 'should offset take profit from ATR even without RR');
  });

  it('uses trailing ATR multiplier for targets', () => {
    const trailingCandles: StrategyCandlesSnapshot = {
      symbol: 'ES',
      interval: '5m',
      intervalSeconds: 300,
      candles: [
        { timestamp: 1, open: 100, high: 110, low: 90, close: 105, volume: 1000 },
        { timestamp: 2, open: 105, high: 115, low: 95, close: 110, volume: 1000 }
      ]
    };

    renderPanelWithRuntime(
      {
        strategyId: 'trailing-atr-targets',
        status: { active: true, enabled: true },
        snapshot: {
          summary: {
            position_side: 'long',
            position_size: 1,
            avg_entry_price: 120
          }
        },
        triggerCount: 0,
        lastTriggeredAt: null
      },
      {
        strategyOverrides: {
          id: 'trailing-atr-targets',
          name: 'Trailing ATR Targets',
          isKlineStrategy: true,
          strategyType: 'kline',
          dataSource: 'market-data:kline'
        },
        detailOverrides: {
          strategyType: 'kline',
          dataSource: 'market-data:kline',
          isKlineStrategy: true
        },
        exitConfig: [
          { name: 'exit_mode', value: 'trailing_atr' },
          { name: 'atr_length', value: 2 },
          { name: 'atr_multiplier', value: 3 },
          { name: 'trailing_multiplier', value: 1 }
        ],
        candles: trailingCandles
      }
    );

    assert(screen.getByText('$90.00'), 'should trail stop loss using trailing multiplier');
    assert(screen.getByText('$140.00'), 'should trail take profit using trailing multiplier');
  });
});

