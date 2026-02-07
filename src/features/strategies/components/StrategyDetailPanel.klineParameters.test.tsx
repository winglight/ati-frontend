import React from 'react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { JSDOM } from 'jsdom';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import StrategyDetailPanel from './StrategyDetailPanel';
import strategiesReducer, {
  selectStrategy,
  setStrategies
} from '@store/slices/strategiesSlice';
import authReducer from '@store/slices/authSlice';
import { loadStrategyDetail, updateStrategyParameters } from '@store/thunks/strategies';
import type {
  StrategyDetailSummary,
  StrategyItem,
  StrategyParameterConfig,
  StrategyRiskSettings,
  StrategyRuntimeDetail
} from '@features/dashboard/types';

const assert = (condition: unknown, message: string): void => {
  if (!condition) {
    throw new Error(message);
  }
};

(async () => {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' });

  const previousWindow = (globalThis as { window?: Window }).window;
  const previousDocument = (globalThis as { document?: Document }).document;
  const previousNavigator = (globalThis as { navigator?: Navigator }).navigator;
  const previousMutationObserver = (globalThis as { MutationObserver?: typeof MutationObserver }).MutationObserver;
  const previousHTMLElement = (globalThis as { HTMLElement?: typeof HTMLElement }).HTMLElement;
  const previousNode = (globalThis as { Node?: typeof Node }).Node;
  const previousGetComputedStyle = (globalThis as { getComputedStyle?: typeof getComputedStyle }).getComputedStyle;
  const previousRequestAnimationFrame = (globalThis as { requestAnimationFrame?: typeof requestAnimationFrame }).requestAnimationFrame;
  const previousCancelAnimationFrame = (globalThis as { cancelAnimationFrame?: typeof cancelAnimationFrame }).cancelAnimationFrame;

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
  (globalThis as { requestAnimationFrame?: typeof requestAnimationFrame }).requestAnimationFrame =
    dom.window.requestAnimationFrame?.bind(dom.window) ?? ((callback: FrameRequestCallback) => setTimeout(() => callback(Date.now()), 16));
  (globalThis as { cancelAnimationFrame?: typeof cancelAnimationFrame }).cancelAnimationFrame =
    dom.window.cancelAnimationFrame?.bind(dom.window) ?? ((handle: number) => clearTimeout(handle));

  const store = configureStore({
    reducer: {
      strategies: strategiesReducer,
      auth: authReducer
    }
  });

  const strategyId = 'kline-editable';
  const strategy: StrategyItem = {
    id: strategyId,
    name: 'Kline Demo',
    symbol: 'ES',
    status: 'stopped',
    mode: 'paper',
    returnRate: 0,
    triggerCount: 0,
    lastTriggeredAt: '2024-05-01T00:00:00Z',
    description: 'Test kline strategy',
    templateId: 'kline-template',
    schedule: null,
    parameters: [],
    dataSource: 'market-data:pull',
    strategyOrigin: 'internal',
    isKlineStrategy: true
  };

  const regimeOverrides = {
    calm: { required_hits: 2, cooldown_seconds: 30, default_quantity: 0.5 },
    normal: { required_hits: 3, cooldown_seconds: 15, default_quantity: 1 },
    volatile: { required_hits: 4, cooldown_seconds: 45, default_quantity: 0.75 }
  } as const;

  const parameterDefinitions: StrategyParameterConfig[] = [
    {
      name: 'bar_interval',
      label: 'Interval',
      type: 'str',
      value: '5m',
      options: [
        { label: '1m', value: '1m' },
        { label: '5m', value: '5m' },
        { label: '15m', value: '15m' }
      ]
    },
    {
      name: 'lookback_window',
      label: 'Lookback',
      type: 'str',
      value: '30d',
      options: [
        { label: '7d', value: '7d' },
        { label: '30d', value: '30d' },
        { label: '180d', value: '180d' }
      ]
    },
    {
      name: 'aggregation',
      label: 'Aggregation',
      type: 'str',
      value: 'VWAP',
      options: [
        { label: 'VWAP', value: 'VWAP' },
        { label: 'OHLC', value: 'OHLC' },
        { label: 'EMA', value: 'EMA' }
      ]
    },
    {
      name: 'cooldown_seconds',
      label: 'Signal Cooldown (s)',
      type: 'float',
      value: 15,
      min: 0,
      max: 900,
      step: 15,
      defaultValue: 15,
      description: 'Seconds to wait before accepting another order.'
    },
    {
      name: 'max_loss_streak',
      label: 'Breaker (Max Loss Streak)',
      type: 'int',
      value: 3,
      min: 1,
      max: 10,
      step: 1,
      defaultValue: 3,
      description: 'Consecutive losses allowed before tripping the breaker.'
    },
    {
      name: 'signal_frequency_seconds',
      label: 'Execution Frequency (s)',
      type: 'float',
      value: 120,
      min: 0,
      max: 1800,
      step: 60,
      defaultValue: 120,
      description: 'Minimum wall-clock spacing between queued orders.'
    },
    {
      name: 'regime_condition_overrides',
      label: 'Regime Overrides',
      type: 'dict',
      value: regimeOverrides,
      defaultValue: regimeOverrides,
      description:
        'Per-regime overrides for required_hits, cooldown_seconds, and default_quantity.'
    }
  ];

  const detail: StrategyDetailSummary = {
    id: strategyId,
    name: 'Kline Demo',
    strategyType: 'kline-template',
    dataSource: 'market-data:pull',
    description: 'Editable parameters',
    primarySymbol: 'ES',
    schedule: null,
    parameters: {
      bar_interval: '5m',
      lookback_window: '30d',
      aggregation: 'VWAP',
      cooldown_seconds: 15,
      max_loss_streak: 3,
      signal_frequency_seconds: 120,
      regime_condition_overrides: regimeOverrides
    },
    parameterDefinitions
  };

  const runtime: StrategyRuntimeDetail = {
    strategyId,
    status: { active: false, enabled: false },
    snapshot: { summary: {} },
    triggerCount: 0,
    lastTriggeredAt: null
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

  const updateCalls: Array<{ strategyId: string; parameters: Record<string, unknown> }> = [];
  const originalDispatch = store.dispatch;

  function dispatchThunkLifecycle(payload: { strategyId: string; parameters: Record<string, unknown> }) {
    const meta = { arg: { strategyId: payload.strategyId, parameters: payload.parameters } };
    originalDispatch({ type: updateStrategyParameters.pending.type, meta });
    originalDispatch({ type: updateStrategyParameters.fulfilled.type, payload: { id: payload.strategyId, parameters: payload.parameters }, meta });
    const promise = Promise.resolve({ id: payload.strategyId, parameters: payload.parameters }) as Promise<{
      id: string;
      parameters: Record<string, unknown>;
    }>;
    return Object.assign(promise, {
      unwrap: () => Promise.resolve({ id: payload.strategyId, parameters: payload.parameters })
    });
  }

  const wrappedDispatch: typeof store.dispatch = ((action: unknown) => {
    if (typeof action === 'function') {
      const thunkAction = action as (dispatch: typeof store.dispatch, getState: typeof store.getState, extra: unknown) => unknown;
      const typePrefix = (thunkAction as { typePrefix?: string }).typePrefix;
      if (typePrefix === updateStrategyParameters.typePrefix) {
        const arg = ((thunkAction as { arg?: { strategyId: string; parameters: Record<string, unknown> } }).arg) ?? {
          strategyId,
          parameters: {}
        };
        updateCalls.push({ strategyId: arg.strategyId, parameters: { ...arg.parameters } });
        return dispatchThunkLifecycle({ strategyId: arg.strategyId, parameters: arg.parameters });
      }
      return thunkAction(wrappedDispatch, store.getState, undefined);
    }
    return originalDispatch(action as never);
  }) as typeof store.dispatch;

  store.dispatch = wrappedDispatch;

  const { container } = render(
    <Provider store={store}>
      <StrategyDetailPanel
        strategy={store.getState().strategies.items[0] ?? null}
        metrics={null}
        performance={null}
        fallbackMode={store.getState().strategies.fallbackMode}
      />
    </Provider>
  );

  try {
    const user = userEvent.setup({ document: dom.window.document });
    assert(screen.getByText('K 线策略概览'), 'kline summary section should render');

    await user.dblClick(screen.getByText('5m'));
    const intervalSelect = screen.getByTestId('kline-interval-select') as HTMLSelectElement;
    await user.selectOptions(intervalSelect, '15m');
    await user.keyboard('{Enter}');
    assert(updateCalls.length === 1, 'interval save should dispatch update');
    assert(updateCalls[0]?.parameters['bar_interval'] === '15m', 'interval update should target bar_interval');

    await user.dblClick(screen.getByText('30d'));
    const lookbackSelect = screen.getByTestId('kline-lookback-select') as HTMLSelectElement;
    await user.selectOptions(lookbackSelect, '180d');
    await user.keyboard('{Escape}');
    assert(updateCalls.length === 1, 'escape should cancel lookback update');

    await user.dblClick(screen.getByText('30d'));
    const lookbackSelectConfirm = screen.getByTestId('kline-lookback-select') as HTMLSelectElement;
    await user.selectOptions(lookbackSelectConfirm, '180d');
    await user.keyboard('{Enter}');
    assert(updateCalls.length === 2, 'lookback save should dispatch update');
    assert(updateCalls[1]?.parameters['lookback_window'] === '180d', 'lookback update should target lookback_window');

    await user.dblClick(screen.getByText('VWAP'));
    const aggregationSelect = screen.getByTestId('kline-aggregation-select') as HTMLSelectElement;
    await user.selectOptions(aggregationSelect, 'OHLC');
    await user.tab();
    assert(updateCalls.length === 2, 'blur should not dispatch aggregation update');

    await user.dblClick(screen.getByText('VWAP'));
    const aggregationSelectConfirm = screen.getByTestId('kline-aggregation-select') as HTMLSelectElement;
    await user.selectOptions(aggregationSelectConfirm, 'OHLC');
    await user.keyboard('{Enter}');
    assert(updateCalls.length === 3, 'aggregation save should dispatch update');
    assert(updateCalls[2]?.parameters['aggregation'] === 'OHLC', 'aggregation update should target aggregation');

    const cooldownRow = screen.getByText('Signal Cooldown (s)').closest('tr');
    assert(cooldownRow, 'cooldown row should render');
    const cooldownCells = within(cooldownRow as HTMLTableRowElement).getAllByRole('cell');
    const cooldownValueCell = cooldownCells[1] as HTMLElement;
    await user.dblClick(cooldownValueCell);
    const cooldownInput = within(cooldownValueCell).getByRole('spinbutton');
    await user.clear(cooldownInput);
    await user.type(cooldownInput, '45.5');
    await user.keyboard('{Enter}');
    assert(updateCalls.length === 4, 'cooldown save should dispatch update');
    assert(
      updateCalls[3]?.parameters['cooldown_seconds'] === 45.5,
      'cooldown update should target cooldown_seconds'
    );

    const lossStreakRow = screen.getByText('Breaker (Max Loss Streak)').closest('tr');
    assert(lossStreakRow, 'loss streak row should render');
    const lossStreakCells = within(lossStreakRow as HTMLTableRowElement).getAllByRole('cell');
    const lossStreakValueCell = lossStreakCells[1] as HTMLElement;
    await user.dblClick(lossStreakValueCell);
    const lossStreakInput = within(lossStreakValueCell).getByRole('spinbutton');
    await user.clear(lossStreakInput);
    await user.type(lossStreakInput, '5');
    await user.keyboard('{Enter}');
    assert(updateCalls.length === 5, 'loss streak save should dispatch update');
    assert(
      updateCalls[4]?.parameters['max_loss_streak'] === 5,
      'loss streak update should target max_loss_streak'
    );

    const frequencyRow = screen.getByText('Execution Frequency (s)').closest('tr');
    assert(frequencyRow, 'frequency row should render');
    const frequencyCells = within(frequencyRow as HTMLTableRowElement).getAllByRole('cell');
    const frequencyValueCell = frequencyCells[1] as HTMLElement;
    await user.dblClick(frequencyValueCell);
    const frequencyInput = within(frequencyValueCell).getByRole('spinbutton');
    await user.clear(frequencyInput);
    await user.type(frequencyInput, '600');
    await user.keyboard('{Escape}');
    assert(updateCalls.length === 5, 'escape should cancel frequency update');

    const overridesRow = screen.getByText('Regime Overrides').closest('tr');
    assert(overridesRow, 'regime overrides row should render');
    const overridesCells = within(overridesRow as HTMLTableRowElement).getAllByRole('cell');
    const overridesValueCell = overridesCells[1] as HTMLElement;
    within(overridesValueCell).getByText((content) => content.includes('"calm"'));
    await user.dblClick(overridesValueCell);
    const overridesInput = within(overridesValueCell).getByRole('textbox');
    await user.clear(overridesInput);
    await user.paste('{"calm":{"required_hits":5,"cooldown_seconds":25,"default_quantity":0.4}}');
    await user.keyboard('{Enter}');
    assert(updateCalls.length === 6, 'overrides save should dispatch update');
    const overridesPayload = updateCalls[5]?.parameters['regime_condition_overrides'] as
      | Record<string, unknown>
      | undefined;
    assert(overridesPayload, 'overrides payload should exist');
    assert(
      typeof overridesPayload === 'object' && !Array.isArray(overridesPayload),
      'overrides payload should be an object'
    );
    const calmOverrides = (overridesPayload as {
      calm?: { required_hits?: number; cooldown_seconds?: number; default_quantity?: number };
    }).calm;
    assert(calmOverrides, 'calm overrides should exist on payload');
    assert(calmOverrides?.required_hits === 5, 'calm required_hits should update to 5');
    assert(calmOverrides?.cooldown_seconds === 25, 'calm cooldown_seconds should update to 25');
    assert(calmOverrides?.default_quantity === 0.4, 'calm default_quantity should update to 0.4');
    assert(
      Object.keys(overridesPayload as Record<string, unknown>).length === 1,
      'overrides payload should only include calm regime'
    );
  } finally {
    cleanup();
    container.remove();
    (globalThis as { window?: Window }).window = previousWindow;
    (globalThis as { document?: Document }).document = previousDocument;
    Object.defineProperty(globalThis, 'navigator', {
      value: previousNavigator,
      writable: true,
      configurable: true
    });
    (globalThis as { MutationObserver?: typeof MutationObserver }).MutationObserver = previousMutationObserver;
    (globalThis as { HTMLElement?: typeof HTMLElement }).HTMLElement = previousHTMLElement;
    (globalThis as { Node?: typeof Node }).Node = previousNode;
    (globalThis as { getComputedStyle?: typeof getComputedStyle }).getComputedStyle = previousGetComputedStyle;
    (globalThis as { requestAnimationFrame?: typeof requestAnimationFrame }).requestAnimationFrame = previousRequestAnimationFrame;
    (globalThis as { cancelAnimationFrame?: typeof cancelAnimationFrame }).cancelAnimationFrame = previousCancelAnimationFrame;
  }
})();
