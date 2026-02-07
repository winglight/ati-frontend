import '../../../tests/domShim';
import React from 'react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { cleanup, fireEvent, render, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import StrategyDetailPanel from './StrategyDetailPanel';
import strategiesReducer, { selectStrategy, setStrategies } from '../../../store/slices/strategiesSlice';
import authReducer from '../../../store/slices/authSlice';
import { loadStrategyDetail, updateStrategyParameters } from '../../../store/thunks/strategies';
import type {
  StrategyDetailSummary,
  StrategyItem,
  StrategyParameterConfig,
  StrategyRiskSettings,
  StrategyRuntimeDetail
} from '../../dashboard/types';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

(async () => {
  document.body.innerHTML = '';
  try {
    if (typeof window !== 'undefined' && window?.history?.replaceState) {
      window.history.replaceState(null, '', 'http://localhost/strategies');
    }
  } catch (_error) {
    // Ignore history errors in non-browser environments.
  }

  const store = configureStore({
    reducer: {
      strategies: strategiesReducer,
      auth: authReducer
    }
  });

  const originalFetch = globalThis.fetch;
  const mockFetch: typeof globalThis.fetch = async (_input, init = {}) => {
    let parameters: Record<string, unknown> = {};
    const body = init.body;
    if (typeof body === 'string') {
      try {
        const parsed = JSON.parse(body) as { parameters?: Record<string, unknown> };
        if (parsed && typeof parsed === 'object' && parsed.parameters && typeof parsed.parameters === 'object') {
          parameters = parsed.parameters;
        }
      } catch (_error) {
        // ignore malformed JSON in tests
      }
    }
    const responseBody = JSON.stringify({ parameters });
    return new Response(responseBody, {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  };
  globalThis.fetch = mockFetch;

  const strategyId = 'dom-momentum';
  const multiplierValue = { low: 0.8, normal: 1, high: 1.2 } as const;

  const parameterDefinitions: StrategyParameterConfig[] = [
    {
      name: 'volatility_regime_multipliers',
      label: 'Regime Multipliers',
      type: 'dict',
      value: multiplierValue,
      description: 'Multiplier adjustments per volatility regime.'
    },
    {
      name: 'disabled_regimes',
      label: 'Disabled Regimes',
      type: 'list[str]',
      value: ['high'],
      description: 'Regimes that should be skipped.'
    }
  ];

  const strategy: StrategyItem = {
    id: strategyId,
    name: 'DOM Momentum',
    symbol: 'ES',
    status: 'stopped',
    mode: 'paper',
    returnRate: 0,
    triggerCount: 0,
    lastTriggeredAt: '2024-05-01T00:00:00Z',
    description: 'DOM momentum strategy',
    templateId: 'dom-momentum-template',
    schedule: null,
    parameters: parameterDefinitions,
    dataSource: 'market-data:stream',
    strategyOrigin: 'internal',
    isKlineStrategy: false
  };

  const detail: StrategyDetailSummary = {
    id: strategyId,
    name: 'DOM Momentum',
    strategyType: 'dom-momentum-template',
    dataSource: 'market-data:stream',
    description: 'DOM strategy parameters test',
    primarySymbol: 'ES',
    schedule: null,
    parameters: {
      volatility_regime_multipliers: multiplierValue,
      disabled_regimes: ['high']
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

  store.dispatch = ((action: unknown) => {
    if (typeof action === 'function') {
      return (action as unknown as (
        dispatch: typeof store.dispatch,
        getState: typeof store.getState,
        extra: unknown
      ) => unknown)(store.dispatch, store.getState, undefined);
    }
    if (action && typeof action === 'object' && 'type' in action) {
      const typed = action as { type: string; meta?: { arg?: { strategyId: string; parameters: Record<string, unknown> } } };
      if (typed.type === updateStrategyParameters.pending.type && typed.meta?.arg) {
        const { strategyId: pendingStrategyId, parameters } = typed.meta.arg;
        updateCalls.push({ strategyId: pendingStrategyId, parameters: { ...parameters } });
      }
    }
    return originalDispatch(action as never);
  }) as typeof store.dispatch;

  const state = store.getState() as unknown as {
    strategies: {
      items: StrategyItem[];
      fallbackMode: string | null;
    };
  };

  const { container } = render(
    <Provider store={store}>
      <StrategyDetailPanel
        strategy={state.strategies.items[0] ?? null}
        metrics={null}
        performance={null}
        fallbackMode={state.strategies.fallbackMode}
      />
    </Provider>
  );

  try {
    const user = userEvent.setup({ document });
    const view = within(document.body);
    const multipliersRow = container.querySelector<HTMLTableRowElement>(
      'tr[data-parameter-name="volatility_regime_multipliers"]'
    );
    assert(multipliersRow, 'Regime multipliers row should exist');
    const multipliersCells = Array.from(multipliersRow.querySelectorAll('td'));
    const multipliersValueCell = multipliersCells[1] as HTMLElement;
    const multipliersTarget = (multipliersValueCell.querySelector('span') ?? multipliersValueCell) as HTMLElement;
    fireEvent.dblClick(multipliersTarget);

    await waitFor(() => {
      assert(view.getByTestId('volatility-multipliers-modal'), 'Volatility multipliers modal should open');
    });

    const lowInput = view.getByTestId('volatility-input-low') as HTMLInputElement;
    const normalInput = view.getByTestId('volatility-input-normal') as HTMLInputElement;
    const highInput = view.getByTestId('volatility-input-high') as HTMLInputElement;

    assert(lowInput.value === '0.8', 'Low multiplier should prefill');
    assert(normalInput.value === '1', 'Normal multiplier should prefill');
    assert(highInput.value === '1.2', 'High multiplier should prefill');

    await user.clear(lowInput);
    await user.click(view.getByTestId('volatility-submit'));
    assert(
      view.getByText('请为所有波动率区间输入有效的数字'),
      'Validation error should appear when fields are empty'
    );
    assert(updateCalls.length === 0, 'Validation failure should not dispatch update');

    await user.type(lowInput, '0.75');
    await user.clear(normalInput);
    await user.type(normalInput, '1.05');
    await user.clear(highInput);
    await user.type(highInput, '1.3');
    await user.click(view.getByTestId('volatility-submit'));

    await waitFor(() => {
      assert(updateCalls.length === 1, 'Volatility multipliers should trigger update call');
    });

    await waitFor(() => {
      assert(!view.queryByTestId('volatility-multipliers-modal'), 'Volatility modal should close after save');
    });

    const multipliersPayload = updateCalls[0]?.parameters['volatility_regime_multipliers'] as
      | Record<string, number>
      | undefined;
    assert(multipliersPayload, 'Multipliers payload should exist');
    assert(
      Math.abs((multipliersPayload?.low ?? 0) - 0.75) < 1e-9,
      'Low multiplier should be updated'
    );
    assert(
      Math.abs((multipliersPayload?.normal ?? 0) - 1.05) < 1e-9,
      'Normal multiplier should be updated'
    );
    assert(
      Math.abs((multipliersPayload?.high ?? 0) - 1.3) < 1e-9,
      'High multiplier should be updated'
    );

    await waitFor(() => {
      assert(
        container.querySelector<HTMLTableRowElement>('tr[data-parameter-name="disabled_regimes"]'),
        'Disabled regimes row should exist'
      );
    });
    const disabledRow = container.querySelector<HTMLTableRowElement>(
      'tr[data-parameter-name="disabled_regimes"]'
    );
    assert(disabledRow, 'Disabled regimes row should exist');
    const disabledCells = Array.from(disabledRow.querySelectorAll('td'));
    const disabledValueCell = disabledCells[1] as HTMLElement;
    const disabledTarget = (disabledValueCell.querySelector('span') ?? disabledValueCell) as HTMLElement;
    fireEvent.dblClick(disabledTarget);

    await waitFor(() => {
      assert(view.getByTestId('disabled-regimes-modal'), 'Disabled regimes modal should open');
    });

    const highCheckbox = view.getByTestId('disabled-checkbox-high') as HTMLInputElement;
    const lowCheckbox = view.getByTestId('disabled-checkbox-low') as HTMLInputElement;

    assert(highCheckbox.checked, 'High regime should start checked');
    assert(!lowCheckbox.checked, 'Low regime should start unchecked');

    await user.click(highCheckbox);
    await user.click(lowCheckbox);

    const selectedTags = view.getAllByTestId('disabled-tag');
    assert(selectedTags.length === 1, 'Only one disabled regime tag should remain');
    assert(selectedTags[0]?.textContent?.includes('Low'), 'Low regime tag should display');

    await user.click(view.getByTestId('disabled-submit'));

    await waitFor(() => {
      assert(updateCalls.length === 2, 'Disabled regimes save should trigger update');
    });

    await waitFor(() => {
      assert(!view.queryByTestId('disabled-regimes-modal'), 'Disabled regimes modal should close after save');
    });

    const disabledPayload = updateCalls[1]?.parameters['disabled_regimes'] as
      | string[]
      | undefined;
    assert(disabledPayload, 'Disabled regimes payload should exist');
    assert(disabledPayload?.length === 1, 'Disabled payload should contain one entry');
    assert(disabledPayload?.[0] === 'low', 'Disabled payload should normalize to lowercase');
  } finally {
    cleanup();
    container.remove();
    store.dispatch = originalDispatch;
    globalThis.fetch = originalFetch;
  }
})();
