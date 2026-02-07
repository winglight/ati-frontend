import { expect, test } from '@playwright/test';

test.describe('Strategy detail panel browser flow', () => {
  test('supports tab interactions and summary/risk edits', async ({ page }) => {
    await page.addInitScript(() => {
      window.__ALGOTRADER_SKIP_AUTH__ = true;
      window.localStorage.setItem('algoTrader.accessToken', 'test-token');
    });

    const strategyId = 'strategy-e2e';

    const summaryState = {
      primary_symbol: 'ETH-USD',
      data_source: 'market-data',
      strategy_origin: 'internal',
      trigger_count: 88,
      last_triggered_at: '2024-03-25T09:10:00Z'
    };

    const riskState = {
      strategy_id: strategyId,
      max_position: 50,
      forbid_pyramiding: false,
      loss_threshold: -500,
      loss_duration_minutes: 30,
      notify_on_breach: true,
      updated_at: '2024-03-25T09:00:00Z'
    };

    const performancePayload = {
      summary: {
        total_pnl: 1500.12,
        win_rate: 0.58,
        max_drawdown: -210.45,
        sharpe: 1.24,
        trade_count: 34,
        avg_trade_duration: 3600
      },
      orders: {
        items: [
          {
            order_id: 'ord-1',
            timestamp: '2024-03-25T08:30:00Z',
            quantity: 2,
            price: 1825.5,
            side: 'buy',
            pnl: 120.4,
            source: 'signal-engine'
          }
        ],
        total: 1,
        page: 1,
        page_size: 50,
        has_next: false
      },
      realtime: {
        signal_rate: 12,
        fills: 4
      },
      updated_at: '2024-03-25T09:05:00Z',
      charts: {
        cumulative_pnl: [
          { timestamp: '2024-03-24T09:00:00Z', value: 800 },
          { timestamp: '2024-03-25T09:00:00Z', value: 1500.12 }
        ],
        drawdown: [
          { timestamp: '2024-03-24T12:00:00Z', value: -50 },
          { timestamp: '2024-03-25T08:00:00Z', value: -210.45 }
        ],
        distribution: [
          { bucket: 'loss', value: -3 },
          { bucket: 'gain', value: 5 }
        ],
        win_loss: [
          { bucket: 'win', value: 21 },
          { bucket: 'loss', value: 13 }
        ]
      },
      calendar: {
        start: '2024-03-01',
        end: '2024-03-31',
        months: [
          {
            month: '2024-03',
            days: [
              { date: '2024-03-24', pnl: 120 },
              { date: '2024-03-25', pnl: -40 }
            ]
          }
        ]
      }
    };

    const candlesPayload = {
      interval: '5m',
      candles: [
        {
          timestamp: '2024-03-25T09:00:00Z',
          open: 1800,
          high: 1820,
          low: 1795,
          close: 1810,
          volume: 250
        },
        {
          timestamp: '2024-03-25T09:05:00Z',
          open: 1810,
          high: 1830,
          low: 1805,
          close: 1825,
          volume: 310
        }
      ],
      signals: [
        {
          timestamp: '2024-03-25T09:05:00Z',
          side: 'buy',
          price: 1825,
          pnl: 45.2
        }
      ],
      trend: [
        { timestamp: '2024-03-25T09:00:00Z', value: 0.4 },
        { timestamp: '2024-03-25T09:05:00Z', value: 0.6 }
      ]
    };

    await page.route('**/strategies', async (route) => {
      if (route.request().method() !== 'GET' || !route.request().url().endsWith('/strategies')) {
        await route.fallback();
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          strategies: [
            {
              name: strategyId,
              title: 'E2E Momentum',
              description: 'Browser harness strategy',
              enabled: true,
              active: true,
              symbol: summaryState.primary_symbol,
              strategy_type: 'momentum',
              data_source: summaryState.data_source,
              strategy_origin: summaryState.strategy_origin,
              trigger_count: summaryState.trigger_count,
              last_triggered_at: summaryState.last_triggered_at,
              parameters: [
                { name: 'lookback', label: 'Lookback', value: 12 },
                { name: 'threshold', label: 'Threshold', value: 1.5 }
              ]
            }
          ]
        })
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
        body: JSON.stringify({
          config: {
            strategy_id: strategyId,
            title: 'E2E Momentum',
            description: 'Browser harness strategy',
            primary_symbol: summaryState.primary_symbol,
            data_source: summaryState.data_source,
            strategy_origin: summaryState.strategy_origin,
            trigger_count: summaryState.trigger_count,
            last_triggered_at: summaryState.last_triggered_at,
            created_at: '2024-03-20T08:00:00Z',
            updated_at: '2024-03-25T09:05:00Z',
            parameters: {
              lookback: 12,
              threshold: 1.5
            }
          },
          runtime: {
            strategy_id: strategyId,
            status: { active: true, enabled: true },
            snapshot: {
              refreshed_at: '2024-03-25T09:05:00Z',
              summary: performancePayload.summary,
              signal_rate: 12,
              heartbeat: 1024
            },
            trigger_count: summaryState.trigger_count,
            last_triggered_at: summaryState.last_triggered_at
          },
          risk: riskState
        })
      });
    });

    await page.route(`**/strategies/${strategyId}/risk-settings`, async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ risk_settings: riskState })
        });
        return;
      }
      const submitted = JSON.parse(route.request().postData() ?? '{}');
      expect(submitted).toMatchObject({
        max_position: 35,
        loss_threshold: -250,
        loss_duration_minutes: 20,
        forbid_pyramiding: true,
        notify_on_breach: false
      });
      Object.assign(riskState, submitted, {
        updated_at: '2024-03-25T09:20:00Z'
      });
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ risk_settings: riskState })
      });
    });

    await page.route(`**/strategies/${strategyId}/summary`, async (route) => {
      const submitted = JSON.parse(route.request().postData() ?? '{}');
      expect(submitted).toMatchObject({
        primary_symbol: 'BTC-USD',
        data_source: 'simulated-feed:poll',
        strategy_origin: 'external'
      });
      summaryState.primary_symbol = submitted.primary_symbol;
      summaryState.data_source = submitted.data_source;
      summaryState.strategy_origin = submitted.strategy_origin;
      summaryState.last_triggered_at = '2024-03-25T10:00:00Z';
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          summary: {
            strategy_id: strategyId,
            title: 'E2E Momentum',
            primary_symbol: summaryState.primary_symbol,
            data_source: summaryState.data_source,
            strategy_origin: summaryState.strategy_origin,
            trigger_count: summaryState.trigger_count,
            last_triggered_at: summaryState.last_triggered_at,
            updated_at: '2024-03-25T10:00:00Z'
          }
        })
      });
    });

    await page.route(`**/strategies/${strategyId}/performance*`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(performancePayload)
      });
    });

    await page.route(`**/strategies/${strategyId}/metrics`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ metrics: { latency: 12 }, updated_at: '2024-03-25T09:04:00Z' })
      });
    });

    await page.route(`**/strategies/${strategyId}/candles*`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(candlesPayload)
      });
    });

    await page.goto('/__test__/strategy-detail');

    await expect(page.getByRole('heading', { name: /E2E Momentum/i })).toBeVisible();
    await expect(page.getByText('$1,500.12')).toBeVisible();
    await expect(page.getByText('Win Rate')).toBeVisible();

    const primaryInput = page.getByLabel('Primary Symbol');
    await expect(primaryInput).toHaveValue('ETH-USD');
    await primaryInput.fill('BTC-USD');

    await page.getByLabel('Data Source').selectOption('simulated-feed');
    const pushToggle = page.getByLabel('启用实时推送');
    await pushToggle.uncheck();
    await page.getByLabel('Strategy Origin').selectOption('external');

    await page.getByRole('button', { name: 'Save Changes' }).click();
    await expect(page.getByText('摘要设置已更新')).toBeVisible();
    await expect(primaryInput).toHaveValue('BTC-USD');
    await expect(pushToggle).not.toBeChecked();

    await page.getByRole('button', { name: 'Risk Control Settings' }).click();
    await expect(page.getByLabel('Max Position Count')).toHaveValue('50');

    await page.getByLabel('Max Position Count').fill('35');
    await page.getByLabel('Unrealized loss threshold').fill('-250');
    await page.getByLabel('Unrealized loss duration threshold (minutes)').fill('20');
    await page.getByLabel('禁止加仓').check();
    await page.getByLabel('触发阈值时发送通知').uncheck();

    await page.getByRole('button', { name: 'Save Settings' }).click();
    await expect(page.getByText('风险设置已更新')).toBeVisible();

    await page.getByRole('button', { name: 'Strategy Candles' }).click();
    await expect(page.getByText('Latest Signals')).toBeVisible();
    await expect(page.getByText(/buy/i)).toBeVisible();

    await page.getByRole('button', { name: 'PnL Calendar' }).click();
    await expect(page.getByText('2024-03')).toBeVisible();
  });
});
