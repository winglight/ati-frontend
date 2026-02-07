import React, { createRef } from 'react';
import { JSDOM } from 'jsdom';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import KlineSummarySection from './KlineSummarySection';
import type { StrategyScheduleWindow } from '@features/dashboard/types';

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' });
const { window } = dom;

(globalThis as unknown as Record<string, unknown>).window = window;
(globalThis as unknown as Record<string, unknown>).document = window.document;
(globalThis as unknown as Record<string, unknown>).navigator = window.navigator;
(globalThis as unknown as Record<string, unknown>).HTMLElement = window.HTMLElement;
(globalThis as unknown as Record<string, unknown>).Node = window.Node;
(globalThis as unknown as Record<string, unknown>).MutationObserver = window.MutationObserver;
(globalThis as unknown as Record<string, unknown>).getComputedStyle = window.getComputedStyle.bind(window);
(globalThis as unknown as Record<string, unknown>).requestAnimationFrame =
  window.requestAnimationFrame?.bind(window) ?? ((cb: FrameRequestCallback) => setTimeout(() => cb(Date.now()), 16));
(globalThis as unknown as Record<string, unknown>).cancelAnimationFrame =
  window.cancelAnimationFrame?.bind(window) ?? ((id: number) => clearTimeout(id));

type Assertion = (condition: unknown, message: string) => asserts condition;

const assert: Assertion = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const scheduleWindows: StrategyScheduleWindow[] = [
  { start: '09:30', end: '16:00' },
  { start: '19:00', end: '20:00' }
];

const intervalOptions = [
  { label: '1 Minute', value: '1m' },
  { label: '5 Minutes', value: '5m' },
  { label: '15 Minutes', value: '15m' }
];

const lookbackOptions = [
  { label: '7 Days', value: '7d' },
  { label: '30 Days', value: '30d' },
  { label: '90 Days', value: '90d' }
];

const aggregationOptions = [
  { label: 'VWAP', value: 'VWAP' },
  { label: 'OHLC', value: 'OHLC' },
  { label: 'EMA', value: 'EMA' }
];

(async () => {
  const user = userEvent.setup({ document: window.document });
  const startEditCalls: number[] = [];

  const { container } = render(
    <KlineSummarySection
      summarySymbol="ESM4"
      resolvedSymbol="ESM4"
      isEditing={false}
      summarySaving={false}
      summaryMessage="保存成功"
      summaryTone="success"
      onStartEdit={() => {
        startEditCalls.push(Date.now());
      }}
      onSymbolChange={() => undefined}
      onSymbolBlur={() => undefined}
      onSymbolKeyDown={() => undefined}
      symbolEditorRef={createRef<HTMLInputElement>()}
      canEditSymbol={true}
      scheduleWindows={scheduleWindows}
      timezone="America/New_York"
      timezoneOptions={[{ label: 'America/New_York', value: 'America/New_York' }]}
      timezoneDraft="America/New_York"
      isTimezoneEditing={false}
      timezoneDisabled={false}
      canEditTimezone={true}
      onTimezoneStartEdit={() => undefined}
      onTimezoneChange={() => undefined}
      onTimezoneSave={() => undefined}
      onTimezoneCancel={() => undefined}
      timezoneSelectRef={createRef<HTMLSelectElement>()}
      description="测试策略描述"
      dataSourceLabel="Historical Feed"
      intervalLabel="1 Minute"
      lookbackLabel="30 Days"
      aggregationLabel="VWAP"
      intervalOptions={intervalOptions}
      lookbackOptions={lookbackOptions}
      aggregationOptions={aggregationOptions}
      intervalValue="1m"
      lookbackValue="30d"
      aggregationValue="VWAP"
      isIntervalEditing={false}
      isLookbackEditing={false}
      isAggregationEditing={false}
      onIntervalStartEdit={() => undefined}
      onLookbackStartEdit={() => undefined}
      onAggregationStartEdit={() => undefined}
      onIntervalChange={(value) => {
        void value;
      }}
      onLookbackChange={(value) => {
        void value;
      }}
      onAggregationChange={(value) => {
        void value;
      }}
      onIntervalSave={() => undefined}
      onLookbackSave={() => undefined}
      onAggregationSave={() => undefined}
      onIntervalCancel={() => undefined}
      onLookbackCancel={() => undefined}
      onAggregationCancel={() => undefined}
    />
  );

  try {
    assert(screen.getByText('K 线策略概览'), 'should render card header');
    assert(screen.getByText('Primary Symbol'), 'should render symbol label');
    assert(screen.getByText('ESM4'), 'should render resolved symbol');
    assert(screen.getByRole('button', { name: '编辑' }), 'should render edit button');
    assert(screen.getByText('Historical Feed'), 'should render data source');
    assert(screen.getByText('1 Minute'), 'should render interval');
    assert(screen.getByText('30 Days'), 'should render lookback label');
    assert(screen.getByText('VWAP'), 'should render aggregation label');
    assert(screen.getByText('09:30 → 16:00'), 'should render primary schedule window');
    assert(screen.getByText('America/New_York'), 'should render timezone');
    assert(screen.getByText('测试策略描述'), 'should render description');
    assert(screen.getByText('19:00 → 20:00'), 'should render secondary schedule badge');
    assert(screen.getByText('保存成功'), 'should render summary status message');
    const editButton = screen.getByRole('button', { name: '编辑' });
    await user.click(editButton);
    assert(startEditCalls.length === 1, 'clicking edit should invoke handler');
  } finally {
    cleanup();
    container.remove();
  }
})();

(async () => {
  const user = userEvent.setup({ document: window.document });
  const changeValues: string[] = [];
  let blurCount = 0;
  let keyDownCount = 0;

  const ref = createRef<HTMLInputElement>();

  const { container } = render(
    <KlineSummarySection
      summarySymbol=""
      resolvedSymbol="MNQH4"
      isEditing={true}
      summarySaving={false}
      summaryMessage="保存失败"
      summaryTone="error"
      onStartEdit={() => undefined}
      onSymbolChange={(event) => {
        changeValues.push(event.target.value);
      }}
      onSymbolBlur={() => {
        blurCount += 1;
      }}
      onSymbolKeyDown={() => {
        keyDownCount += 1;
      }}
      symbolEditorRef={ref}
      canEditSymbol={true}
      scheduleWindows={[]}
      timezone="UTC"
      timezoneOptions={[{ label: 'UTC±00:00', value: 'UTC' }]}
      timezoneDraft="UTC"
      isTimezoneEditing={false}
      timezoneDisabled={false}
      canEditTimezone={true}
      onTimezoneStartEdit={() => undefined}
      onTimezoneChange={() => undefined}
      onTimezoneSave={() => undefined}
      onTimezoneCancel={() => undefined}
      timezoneSelectRef={createRef<HTMLSelectElement>()}
      description=""
      dataSourceLabel=""
      intervalLabel={null}
      lookbackLabel={null}
      aggregationLabel={null}
      intervalOptions={intervalOptions}
      lookbackOptions={lookbackOptions}
      aggregationOptions={aggregationOptions}
      intervalValue={intervalOptions[0]!.value}
      lookbackValue={lookbackOptions[1]!.value}
      aggregationValue={aggregationOptions[0]!.value}
      isIntervalEditing={false}
      isLookbackEditing={false}
      isAggregationEditing={false}
      onIntervalStartEdit={() => undefined}
      onLookbackStartEdit={() => undefined}
      onAggregationStartEdit={() => undefined}
      onIntervalChange={(value) => {
        void value;
      }}
      onLookbackChange={(value) => {
        void value;
      }}
      onAggregationChange={(value) => {
        void value;
      }}
      onIntervalSave={() => undefined}
      onLookbackSave={() => undefined}
      onAggregationSave={() => undefined}
      onIntervalCancel={() => undefined}
      onLookbackCancel={() => undefined}
      onAggregationCancel={() => undefined}
      placeholder="例如：MNQ"
    />
  );

  try {
    const input = screen.getByPlaceholderText('例如：MNQ') as HTMLInputElement;
    await user.click(input);
    await user.type(input, 'mnq');
    await user.keyboard('{Enter}');
    await user.tab();

    assert(changeValues.some((value) => value.includes('mnq')), 'should capture symbol change values');
    assert(keyDownCount >= 1, 'should track keydown events when typing');
    assert(blurCount >= 1, 'should call blur handler when focus leaves input');

    assert(screen.getByText('Data Feed'), 'should render data feed label');
    assert(screen.getByText('Market Data Feed'), 'should use fallback data source label');
    assert(screen.getByText('未配置'), 'should render fallback interval label');
    assert(screen.getByText('默认全天'), 'should render default schedule hint');
    assert(screen.getByText('暂无描述'), 'should render description fallback');
    const editButton = screen.getByRole('button', { name: '编辑' });
    assert(editButton.hasAttribute('disabled'), 'edit button should be disabled while editing');
  } finally {
    cleanup();
    container.remove();
  }
})();

(async () => {
  const user = userEvent.setup({ document: window.document });
  const intervalSaves: string[] = [];
  const lookbackSaves: string[] = [];
  const aggregationSaves: string[] = [];
  let lookbackCancelCount = 0;
  let aggregationCancelCount = 0;

  type KlineField = 'interval' | 'lookback' | 'aggregation';

  const resolveLabel = (field: KlineField, value: string) => {
    const source =
      field === 'interval'
        ? intervalOptions
        : field === 'lookback'
          ? lookbackOptions
          : aggregationOptions;
    return source.find((option) => option.value === value)?.label ?? value;
  };

  const InteractiveWrapper = () => {
    const [editingField, setEditingField] = React.useState<KlineField | null>(null);
    const [values, setValues] = React.useState<{ interval: string; lookback: string; aggregation: string }>(() => ({
      interval: intervalOptions[0]!.value,
      lookback: lookbackOptions[1]!.value,
      aggregation: aggregationOptions[0]!.value
    }));
    const [drafts, setDrafts] = React.useState<{ interval: string; lookback: string; aggregation: string }>(() => ({
      interval: intervalOptions[0]!.value,
      lookback: lookbackOptions[1]!.value,
      aggregation: aggregationOptions[0]!.value
    }));

    const startEdit = (field: KlineField) => {
      setDrafts((previous) => ({ ...previous, [field]: values[field] }));
      setEditingField(field);
    };

    const changeDraft = (field: KlineField, value: string) => {
      setDrafts((previous) => ({ ...previous, [field]: value }));
    };

    const cancelEdit = (field: KlineField) => {
      if (field === 'lookback') {
        lookbackCancelCount += 1;
      } else if (field === 'aggregation') {
        aggregationCancelCount += 1;
      }
      setDrafts((previous) => ({ ...previous, [field]: values[field] }));
      setEditingField((current) => (current === field ? null : current));
    };

    const saveEdit = (field: KlineField) => {
      setValues((previous) => {
        const next = { ...previous, [field]: drafts[field] };
        if (field === 'interval') {
          intervalSaves.push(drafts[field]);
        } else if (field === 'lookback') {
          lookbackSaves.push(drafts[field]);
        } else {
          aggregationSaves.push(drafts[field]);
        }
        return next;
      });
      setDrafts((previous) => ({ ...previous, [field]: drafts[field] }));
      setEditingField(null);
    };

    return (
      <KlineSummarySection
        summarySymbol="MNQ"
        resolvedSymbol="MNQ"
        isEditing={false}
        summarySaving={false}
        summaryMessage={null}
        summaryTone="neutral"
        onStartEdit={() => undefined}
        onSymbolChange={() => undefined}
        onSymbolBlur={() => undefined}
        onSymbolKeyDown={() => undefined}
        symbolEditorRef={createRef<HTMLInputElement>()}
        canEditSymbol={false}
        scheduleWindows={scheduleWindows}
        timezone="America/New_York"
        timezoneOptions={[{ label: 'America/New_York', value: 'America/New_York' }]}
        timezoneDraft="America/New_York"
        isTimezoneEditing={false}
        timezoneDisabled={false}
        canEditTimezone={true}
        onTimezoneStartEdit={() => undefined}
        onTimezoneChange={() => undefined}
        onTimezoneSave={() => undefined}
        onTimezoneCancel={() => undefined}
        timezoneSelectRef={createRef<HTMLSelectElement>()}
        description="交互测试"
        dataSourceLabel="Historical Feed"
        intervalLabel={resolveLabel('interval', values.interval)}
        lookbackLabel={resolveLabel('lookback', values.lookback)}
        aggregationLabel={resolveLabel('aggregation', values.aggregation)}
        intervalOptions={intervalOptions}
        lookbackOptions={lookbackOptions}
        aggregationOptions={aggregationOptions}
        intervalValue={editingField === 'interval' ? drafts.interval : values.interval}
        lookbackValue={editingField === 'lookback' ? drafts.lookback : values.lookback}
        aggregationValue={editingField === 'aggregation' ? drafts.aggregation : values.aggregation}
        isIntervalEditing={editingField === 'interval'}
        isLookbackEditing={editingField === 'lookback'}
        isAggregationEditing={editingField === 'aggregation'}
        onIntervalStartEdit={() => startEdit('interval')}
        onLookbackStartEdit={() => startEdit('lookback')}
        onAggregationStartEdit={() => startEdit('aggregation')}
        onIntervalChange={(value) => changeDraft('interval', value)}
        onLookbackChange={(value) => changeDraft('lookback', value)}
        onAggregationChange={(value) => changeDraft('aggregation', value)}
        onIntervalSave={() => saveEdit('interval')}
        onLookbackSave={() => saveEdit('lookback')}
        onAggregationSave={() => saveEdit('aggregation')}
        onIntervalCancel={() => cancelEdit('interval')}
        onLookbackCancel={() => cancelEdit('lookback')}
        onAggregationCancel={() => cancelEdit('aggregation')}
        canEditInterval={true}
        canEditLookback={true}
        canEditAggregation={true}
        placeholder="例如：MNQ"
      />
    );
  };

  const { container } = render(<InteractiveWrapper />);

  try {
    assert(screen.getByText('1 Minute'), 'should render initial interval label');
    assert(screen.getByText('30 Days'), 'should render initial lookback label');
    assert(screen.getByText('VWAP'), 'should render initial aggregation label');

    await user.dblClick(screen.getByText('1 Minute'));
    const intervalSelect = screen.getByTestId('kline-interval-select') as HTMLSelectElement;
    await user.selectOptions(intervalSelect, intervalOptions[2]!.value);
    await user.keyboard('{Enter}');
    assert(intervalSaves.length === 1, 'pressing enter should trigger interval save');
    assert(intervalSaves[0] === intervalOptions[2]!.value, 'saved interval should match selected option');
    assert(screen.getByText('15 Minutes'), 'interval label should update after saving');

    await user.dblClick(screen.getByText('30 Days'));
    const lookbackSelect = screen.getByTestId('kline-lookback-select') as HTMLSelectElement;
    await user.selectOptions(lookbackSelect, lookbackOptions[2]!.value);
    await user.keyboard('{Escape}');
    assert(lookbackSaves.length === 0, 'escape should cancel without saving lookback');
    assert(lookbackCancelCount >= 1, 'escape should invoke lookback cancel handler');
    assert(!screen.queryByTestId('kline-lookback-select'), 'lookback select should close after cancel');
    assert(screen.getByText('30 Days'), 'lookback label should revert after cancel');

    await user.dblClick(screen.getByText('VWAP'));
    const aggregationSelect = screen.getByTestId('kline-aggregation-select') as HTMLSelectElement;
    await user.selectOptions(aggregationSelect, aggregationOptions[1]!.value);
    await user.tab();
    assert(aggregationCancelCount >= 1, 'blur should trigger aggregation cancel');
    assert(!screen.queryByTestId('kline-aggregation-select'), 'aggregation select should close after blur');
    assert(screen.getByText('VWAP'), 'aggregation label should revert when canceling via blur');

    await user.dblClick(screen.getByText('VWAP'));
    const aggregationSelectFinal = screen.getByTestId('kline-aggregation-select') as HTMLSelectElement;
    await user.selectOptions(aggregationSelectFinal, aggregationOptions[1]!.value);
    await user.keyboard('{Enter}');
    assert(aggregationSaves.length === 1, 'enter should save aggregation value');
    assert(aggregationSaves[0] === aggregationOptions[1]!.value, 'saved aggregation should match selected option');
    assert(screen.getByText('OHLC'), 'aggregation label should reflect saved value');
  } finally {
    cleanup();
    container.remove();
  }
})();
