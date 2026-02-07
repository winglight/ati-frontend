import { expect, test } from '@playwright/test';

test.describe('Scanner strategy detail e2e flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      window.__ALGOTRADER_SKIP_AUTH__ = true;
      window.localStorage.setItem('algoTrader.accessToken', 'test-token');
    });
  });

  test('handles scanner children refresh and overrides', async ({ page }) => {
    const strategyId = 'scanner-e2e';

    const listStrategy = {
      name: strategyId,
      title: 'E2E Scanner Control',
      description: 'Playwright scanner strategy harness',
      enabled: true,
      active: true,
      symbol: 'BTCUSDT',
      strategy_type: 'scanner_orders_guard',
      data_source: 'market-data:push',
      strategy_origin: 'internal',
      trigger_count: 5,
      last_triggered_at: '2024-06-18T09:59:00Z',
      parameters: [
        { name: 'schedule_interval', label: 'Schedule Interval', value: '15m' },
        { name: 'selection_limit', label: 'Selection Limit', value: 5 },
      ],
    };

    const detailConfig = {
      strategy_id: strategyId,
      title: 'E2E Scanner Control',
      description: 'Playwright scanner strategy harness',
      primary_symbol: 'BTCUSDT',
      data_source: 'market-data:push',
      strategy_origin: 'internal',
      trigger_count: 5,
      last_triggered_at: '2024-06-18T09:59:00Z',
      created_at: '2024-06-15T07:00:00Z',
      updated_at: '2024-06-18T10:00:00Z',
      strategy_type: 'scanner_orders_guard',
      scanner_profile: {
        instrument: 'STK',
        location_code: 'SMART',
        scan_code: 'TOP_PERC_GAIN',
        number_of_rows: 20,
        filters: {
          marketCapAbove: 150_000_000_000,
          priceAbove: 15,
        },
      },
      scanner_schedule: {
        frequency: 'intraday',
        interval: '15m',
        timezone: 'America/New_York',
        weekdays: [1, 2, 3, 4, 5],
      },
      child_strategy_type: 'scanner-child',
      child_parameters: {
        max_position: 3,
        take_profit: '3%',
      },
      max_children: 4,
      selection_limit: 5,
    };

    const riskState = {
      strategy_id: strategyId,
      max_position: 3,
      forbid_pyramiding: false,
      loss_threshold: -300,
      loss_duration_minutes: 20,
      notify_on_breach: true,
      updated_at: '2024-06-18T09:40:00Z',
    };

    const performancePayload = {
      summary: {
        total_pnl: 620.75,
        win_rate: 0.54,
        max_drawdown: -120.5,
        sharpe: 1.12,
        trade_count: 28,
        avg_trade_duration: 5400,
      },
      orders: {
        items: [],
        total: 0,
        page: 1,
        page_size: 50,
        has_next: false,
      },
      realtime: { signal_rate: 4, fills: 1 },
      updated_at: '2024-06-18T10:00:00Z',
      charts: {},
      calendar: {},
    };

    const metricsPayload = {
      metrics: { win_rate: 0.54 },
      period: 'day',
      updated_at: '2024-06-18T09:50:00Z',
    };

    const candlesPayload = {
      interval: '5m',
      candles: [],
      signals: [],
      trend: [],
    };

    const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));

    type ScannerSelectionsPayload = {
      strategy_id: string;
      name: string;
      refreshed_at: string;
      scanner: Record<string, unknown>;
    };

    type ScannerChildrenPayload = {
      strategy_id: string;
      name: string;
      parent: Record<string, unknown> | null;
      refreshed_at: string;
      total: number;
      children: Array<Record<string, unknown>>;
    };

    const initialSelections: ScannerSelectionsPayload = {
      strategy_id: strategyId,
      name: 'E2E Scanner Control',
      refreshed_at: '2024-06-18T10:00:30Z',
      scanner: {
        status: 'running',
        trigger_reason: 'manual',
        last_run: '2024-06-18T09:58:00Z',
        last_updated: '2024-06-18T09:59:00Z',
        total_candidates: 5,
        max_children: 4,
        selection_limit: 5,
        schedule_interval: '15m',
        schedule_timezone: 'America/New_York',
        metadata: {
          schedule_interval: '15m',
          schedule_timezone: 'America/New_York',
          overrides: ['TSLA', 'NVDA'],
          child_strategy_type: 'scanner-child',
          note: 'Initial overrides',
        },
        selections: [
          {
            symbol: 'TSLA',
            rank: 1,
            score: 0.98,
            change_percent: 1.2,
            volume: 120_000,
            details: { sector: 'Automotive' },
          },
          {
            symbol: 'NVDA',
            rank: 2,
            score: 0.95,
            change_percent: 0.8,
            volume: 110_000,
            details: { sector: 'Semiconductor' },
          },
        ],
      },
    };

    const refreshedSelections: ScannerSelectionsPayload = {
      strategy_id: strategyId,
      name: 'E2E Scanner Control',
      refreshed_at: '2024-06-18T10:01:30Z',
      scanner: {
        status: 'running',
        trigger_reason: 'scheduled',
        last_run: '2024-06-18T10:01:00Z',
        last_updated: '2024-06-18T10:01:05Z',
        total_candidates: 6,
        max_children: 4,
        selection_limit: 5,
        schedule_interval: '15m',
        schedule_timezone: 'America/New_York',
        metadata: {
          schedule_interval: '15m',
          schedule_timezone: 'America/New_York',
          overrides: ['TSLA', 'NVDA'],
          child_strategy_type: 'scanner-child',
          last_run: '2024-06-18T10:01:00Z',
          total_candidates: 6,
        },
        selections: [
          {
            symbol: 'GOOG',
            rank: 1,
            score: 0.99,
            change_percent: 1.5,
            volume: 125_000,
            details: { sector: 'Technology' },
          },
          {
            symbol: 'TSLA',
            rank: 2,
            score: 0.94,
            change_percent: 1.1,
            volume: 118_000,
            details: { sector: 'Automotive' },
          },
        ],
      },
    };

    const overrideSelectionTemplate = {
      strategy_id: strategyId,
      name: 'E2E Scanner Control',
      refreshed_at: '2024-06-18T10:02:45Z',
      scanner: {
        status: 'running',
        trigger_reason: 'manual',
        last_run: '2024-06-18T10:02:30Z',
        last_updated: '2024-06-18T10:02:45Z',
        total_candidates: 8,
        max_children: 4,
        selection_limit: 5,
        schedule_interval: '15m',
        schedule_timezone: 'America/New_York',
        metadata: {
          schedule_interval: '15m',
          schedule_timezone: 'America/New_York',
          overrides: ['AMZN', 'NFLX'],
          child_strategy_type: 'scanner-child',
          last_run: '2024-06-18T10:02:30Z',
          total_candidates: 8,
        },
        selections: [
          {
            symbol: 'AMZN',
            rank: 1,
            score: 0.93,
            change_percent: -0.2,
            volume: 98_000,
            details: { sector: 'Retail' },
          },
          {
            symbol: 'NFLX',
            rank: 2,
            score: 0.91,
            change_percent: 0.4,
            volume: 92_000,
            details: { sector: 'Media' },
          },
        ],
      },
    } as const;

    const initialChildren: ScannerChildrenPayload = {
      strategy_id: strategyId,
      name: 'E2E Scanner Control',
      parent: { symbol: 'BTCUSDT', status: 'running' },
      refreshed_at: '2024-06-18T10:00:10Z',
      total: 1,
      children: [
        {
          id: 'scanner-child-1',
          name: 'Momentum Watcher',
          symbol: 'TSLA',
          status: 'running',
          pnl: 120.56,
          trade_count: 3,
          updated_at: '2024-06-18T10:00:00Z',
          origin_file: 'strategies/momentum.py',
          metadata: { status: 'running' },
        },
      ],
    };

    const refreshedChildren: ScannerChildrenPayload = {
      strategy_id: strategyId,
      name: 'E2E Scanner Control',
      parent: { symbol: 'BTCUSDT', status: 'running' },
      refreshed_at: '2024-06-18T10:01:10Z',
      total: 1,
      children: [
        {
          id: 'scanner-child-2',
          name: 'Breakout Hunter',
          symbol: 'GOOG',
          status: 'running',
          pnl: 185.42,
          trade_count: 5,
          updated_at: '2024-06-18T10:01:05Z',
          origin_file: 'strategies/breakout.py',
          metadata: { status: 'running' },
        },
      ],
    };

    const overrideChildTemplates = [
      {
        id: 'scanner-child-3',
        name: 'Rebalance Guardian',
        symbol: 'AMZN',
        status: 'running',
        pnl: 210.1,
        trade_count: 6,
        updated_at: '2024-06-18T10:02:40Z',
        origin_file: 'strategies/rebalance.py',
        metadata: { status: 'running' },
      },
      {
        id: 'scanner-child-4',
        name: 'Streaming Sentinel',
        symbol: 'NFLX',
        status: 'running',
        pnl: 198.64,
        trade_count: 4,
        updated_at: '2024-06-18T10:02:44Z',
        origin_file: 'strategies/streaming.py',
        metadata: { status: 'running' },
      },
    ];

    let currentSelections: ScannerSelectionsPayload = clone(initialSelections);
    let currentChildren: ScannerChildrenPayload = clone(initialChildren);

    let hasAppliedRefresh = false;
    let overrideApplied = false;
    let childrenRequestCount = 0;
    let selectionsRequestCount = 0;

    const syncRuntimeSnapshot = () => {
      detailRuntime = {
        strategy_id: strategyId,
        status: { active: true, enabled: true },
        trigger_count: 5,
        last_triggered_at:
          (currentSelections.scanner?.last_run as string | undefined) ??
          '2024-06-18T09:59:00Z',
        snapshot: {
          summary: { buy_signals: 3, sell_signals: 1 },
          refreshedAt: currentSelections.refreshed_at,
          scanner: currentSelections.scanner,
        },
      };
    };

    let detailRuntime = {
      strategy_id: strategyId,
      status: { active: true, enabled: true },
      trigger_count: 5,
      last_triggered_at: '2024-06-18T09:59:00Z',
      snapshot: {
        summary: { buy_signals: 3, sell_signals: 1 },
        refreshedAt: currentSelections.refreshed_at,
        scanner: currentSelections.scanner,
      },
    };

    const detailResponse = {
      config: detailConfig,
      runtime: detailRuntime,
      risk: riskState,
    };

    const buildOverrideSelections = (
      symbols: string[],
    ): ScannerSelectionsPayload => {
      const normalized = symbols
        .map((symbol) => symbol.toUpperCase())
        .filter((symbol) => symbol);
      const template = clone(overrideSelectionTemplate);
      template.scanner.metadata = {
        ...template.scanner.metadata,
        overrides: normalized,
      };
      template.scanner.selections = template.scanner.selections.map(
        (entry, index) => ({
          ...entry,
          symbol: normalized[index] ?? entry.symbol,
          rank: index + 1,
        }),
      );
      return template;
    };

    const buildOverrideChildren = (
      symbols: string[],
    ): ScannerChildrenPayload => {
      const normalized = symbols
        .map((symbol) => symbol.toUpperCase())
        .filter((symbol) => symbol);
      return {
        strategy_id: strategyId,
        name: 'E2E Scanner Control',
        parent: { symbol: 'BTCUSDT', status: 'running' },
        refreshed_at: '2024-06-18T10:02:50Z',
        total: Math.max(1, normalized.length),
        children: overrideChildTemplates
          .map((entry, index) => ({
            ...entry,
            symbol: normalized[index] ?? entry.symbol,
          }))
          .slice(0, Math.max(1, normalized.length)),
      };
    };

    await page.route('**/strategies', async (route) => {
      if (
        route.request().method() !== 'GET' ||
        !route.request().url().endsWith('/strategies')
      ) {
        await route.fallback();
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ strategies: [listStrategy] }),
      });
    });

    await page.route(`**/strategies/${strategyId}`, async (route) => {
      if (route.request().method() !== 'GET') {
        await route.fallback();
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ...detailResponse, runtime: detailRuntime }),
      });
    });

    await page.route(
      `**/strategies/${strategyId}/risk-settings`,
      async (route) => {
        if (route.request().method() !== 'GET') {
          await route.fallback();
          return;
        }
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ risk_settings: riskState }),
        });
      },
    );

    await page.route(`**/strategies/${strategyId}/runtime*`, async (route) => {
      if (route.request().method() !== 'GET') {
        await route.fallback();
        return;
      }
      syncRuntimeSnapshot();
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(detailRuntime),
      });
    });

    await page.route(
      `**/strategies/${strategyId}/scanner/summary`,
      async (route) => {
        if (route.request().method() !== 'GET') {
          await route.fallback();
          return;
        }
        selectionsRequestCount += 1;
        if (
          !hasAppliedRefresh &&
          selectionsRequestCount > 1 &&
          !overrideApplied
        ) {
          currentSelections = clone(refreshedSelections);
          syncRuntimeSnapshot();
        }
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(currentSelections),
        });
      },
    );

    await page.route(`**/strategies/${strategyId}/children`, async (route) => {
      const method = route.request().method();
      if (method === 'GET') {
        childrenRequestCount += 1;
        if (
          !hasAppliedRefresh &&
          childrenRequestCount > 1 &&
          !overrideApplied
        ) {
          currentChildren = clone(refreshedChildren);
          currentSelections = clone(refreshedSelections);
          hasAppliedRefresh = true;
          syncRuntimeSnapshot();
        }
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(currentChildren),
        });
        return;
      }

      if (method === 'POST') {
        const submitted = JSON.parse(route.request().postData() ?? '{}');
        const selectionEntries = Array.isArray(submitted.selections)
          ? submitted.selections
          : [];
        const submittedSymbols = selectionEntries
          .map((entry: Record<string, unknown>) =>
            typeof entry.symbol === 'string'
              ? entry.symbol.toUpperCase()
              : null,
          )
          .filter((value: string | null): value is string => Boolean(value));

        const normalizedSymbols = submittedSymbols.length
          ? submittedSymbols
          : ['AMZN', 'NFLX'];

        currentSelections = buildOverrideSelections(normalizedSymbols);
        currentChildren = buildOverrideChildren(normalizedSymbols);
        overrideApplied = true;
        hasAppliedRefresh = true;
        syncRuntimeSnapshot();

        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(currentChildren),
        });
        return;
      }

      await route.fallback();
    });

    await page.route(
      `**/strategies/${strategyId}/performance*`,
      async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(performancePayload),
        });
      },
    );

    await page.route(`**/strategies/${strategyId}/metrics`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(metricsPayload),
      });
    });

    await page.route(`**/strategies/${strategyId}/candles*`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(candlesPayload),
      });
    });

    await page.goto('/__test__/strategy-detail');

    await expect(
      page.getByRole('heading', { name: /E2E Scanner Control/i }),
    ).toBeVisible();

    await page.getByRole('button', { name: '子策略' }).click();

    await expect(page.getByText('运行概览')).toBeVisible();
    await expect(page.getByText('Momentum Watcher')).toBeVisible();
    await expect(page.getByText('TSLA')).toBeVisible();
    await expect(page.getByText('NVDA')).toBeVisible();
    await expect(page.getByText('筛选结果（Top 10）')).toBeVisible();

    const refreshButton = page.getByRole('button', { name: '刷新' });
    await refreshButton.click();
    await expect(page.getByRole('button', { name: '刷新中…' })).toBeVisible();
    await expect(page.getByText('正在刷新...')).toBeVisible();

    await expect(page.getByText('Breakout Hunter')).toBeVisible();
    await expect(page.getByText('GOOG')).toBeVisible();
    await expect(page.getByRole('button', { name: '刷新' })).toBeVisible();

    const overrideInput = page.getByLabel('输入 Symbol 列表（逗号或空格分隔）');
    await overrideInput.fill('amzn nflx');

    const submitButton = page.getByRole('button', { name: '提交覆盖列表' });
    await submitButton.click();
    await expect(page.getByRole('button', { name: '提交中…' })).toBeVisible();

    await expect(page.getByText('AMZN')).toBeVisible();
    await expect(page.getByText('NFLX')).toBeVisible();
    await expect(page.getByText('Rebalance Guardian')).toBeVisible();

    await expect(page.locator('.toast.success').first()).toContainText('覆盖');

    await refreshButton.click();
    await expect(page.getByRole('button', { name: '刷新中…' })).toBeVisible();
    await expect(page.getByText('Rebalance Guardian')).toBeVisible();
    await expect(page.getByText('AMZN')).toBeVisible();
    await expect(page.getByText('NFLX')).toBeVisible();
  });
});
