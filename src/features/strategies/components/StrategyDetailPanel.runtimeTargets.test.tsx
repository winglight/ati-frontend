import '../../../tests/domShim';
import React from 'react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { render, waitFor, within } from '@testing-library/react';
import StrategyDetailPanel from './StrategyDetailPanel';
import strategiesReducer, { selectStrategy, setStrategies } from '@store/slices/strategiesSlice';
import authReducer from '@store/slices/authSlice';
import { loadStrategyDetail } from '@store/thunks/strategies';
import type {
  StrategyDetailSummary,
  StrategyItem,
  StrategyRiskSettings,
  StrategyRuntimeDetail
} from '@features/dashboard/types';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

const renderPanelWithRuntimeStops = async (
  runtime: StrategyRuntimeDetail,
  exitMode: string
): Promise<ReturnType<typeof render>> => {
  const store = configureStore({
    reducer: {
      strategies: strategiesReducer,
      auth: authReducer
    }
  });

  const strategyId = runtime.strategyId;

  const strategy: StrategyItem = {
    id: strategyId,
    name: 'Runtime Exit Targets',
    symbol: 'ES',
    status: 'running',
    mode: 'paper',
    returnRate: 0,
    triggerCount: 0,
    lastTriggeredAt: null,
    description: '',
    templateId: 'runtime-targets-template',
    schedule: null,
    parameters: [],
    dataSource: 'market-data:stream',
    strategyOrigin: 'internal',
    isKlineStrategy: false
  };

  const detail: StrategyDetailSummary = {
    id: strategyId,
    name: strategy.name,
    strategyType: 'runtime-targets-template',
    dataSource: strategy.dataSource,
    description: '',
    primarySymbol: strategy.symbol,
    schedule: null,
    parameters: {},
    parameterDefinitions: [],
    exit_config: [{ name: 'mode', value: exitMode }]
  };

  const risk: StrategyRiskSettings = {
    strategyId,
    forbidPyramiding: false,
    notifyOnBreach: false
  };

  store.dispatch(setStrategies([strategy]));
  store.dispatch(selectStrategy(strategyId));
  store.dispatch({
    type: loadStrategyDetail.fulfilled.type,
    payload: { id: strategyId, detail, runtime, risk }
  });

  return render(
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

(async () => {
  document.body.innerHTML = '';
  const runtime: StrategyRuntimeDetail = {
    strategyId: 'runtime-fixed-rr',
    status: { active: true, enabled: true },
    snapshot: {
      summary: {},
      stop_levels: {
        stop_loss_enabled: true,
        stop_loss_price: 101,
        take_profit_enabled: true,
        take_profit_price: 125
      }
    },
    triggerCount: 0,
    lastTriggeredAt: null
  };

  const view = await renderPanelWithRuntimeStops(runtime, 'fixed_rr');

  await waitFor(() => {
    view.getByText('Stop Loss Price');
    view.getByText('Take Profit Price');
  });

  const metricsSection = view.getByText('Stop Loss Price').closest('div');
  assert(metricsSection, 'Stop loss metric row should exist');
  const stopLossRow = metricsSection!.parentElement ?? metricsSection;
  const stopLossValue = within(stopLossRow as HTMLElement).getByText('$101.00');
  const tpRow = view.getByText('Take Profit Price').closest('div')!.parentElement ?? undefined;
  const takeProfitValue = within((tpRow as HTMLElement) ?? document.body).getByText('$125.00');

  assert(stopLossValue, 'Runtime stop loss price should render when config is missing');
  assert(takeProfitValue, 'Runtime take profit price should render when config is missing');
})();

(async () => {
  document.body.innerHTML = '';
  const runtime: StrategyRuntimeDetail = {
    strategyId: 'runtime-atr',
    status: { active: true, enabled: true },
    snapshot: {
      summary: {},
      stop_levels: {
        stop_loss_enabled: true,
        stop_loss_price: 2100.5,
        take_profit_enabled: true,
        take_profit_price: 2150.75
      }
    },
    triggerCount: 0,
    lastTriggeredAt: null
  };

  const view = await renderPanelWithRuntimeStops(runtime, 'atr');

  await waitFor(() => {
    view.getByText('Stop Loss Price');
  });

  const stopLossDisplay = view.getByText('$2,100.50');
  const takeProfitDisplay = view.getByText('$2,150.75');

  assert(
    stopLossDisplay,
    'ATR mode should surface runtime stop loss price even without ATR parameters or candles'
  );
  assert(
    takeProfitDisplay,
    'ATR mode should surface runtime take profit price even without ATR parameters or candles'
  );
})();
