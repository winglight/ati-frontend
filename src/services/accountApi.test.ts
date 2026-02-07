const assert = (condition: unknown, message: string): void => {
  if (!condition) {
    throw new Error(message);
  }
};

import { mapAccountSummary, mapAccountPositions } from './accountApi.js';

type SummaryPayload = Parameters<typeof mapAccountSummary>[0];

const payload: SummaryPayload = {
  account: 'DU123456',
  currency: 'USD',
  updated_at: '2024-05-01T10:00:00Z',
  metrics: {
    NetLiquidation: 100_000,
    AvailableFunds: 62_500,
    TotalCashValue: 81_200,
    InitialMarginRequirement: 37_500
  },
  fields: {
    RealizedPnL: { value: '12,345.67', currency: 'USD' },
    UnrealizedPnL: { value: '(1,234.56)', currency: 'USD' },
    DailyPnL: { value: '845.12', currency: 'USD' }
  }
};

const summary = mapAccountSummary(payload);

assert(summary.pnlRealized === 12345.67, 'Realized PnL should parse numeric strings from fields');
assert(summary.pnlUnrealized === -1234.56, 'Unrealized PnL should parse negative values wrapped in parentheses');
assert(summary.pnlRealizedToday === 845.12, 'Realized today should parse optional field values when metrics are absent');

console.log('accountApi summary mapping tests passed');

const positionsPayload = {
  account: 'DU123456',
  currency: 'USD',
  updated_at: '2024-05-01T10:00:00Z',
  count: 5,
  positions: [
    {
      account: 'DU123456',
      contract_id: 101,
      symbol: 'M2KZ4',
      sec_type: 'FUT',
      exchange: 'CME',
      currency: 'USD',
      position: 3,
      avg_cost: 1987.5,
      mark_price: 1992.5,
      unrealized_pnl: 30
    },
    {
      account: 'DU123456',
      contract_id: 101,
      symbol: 'M2KZ4',
      sec_type: 'FUT',
      exchange: 'CME',
      currency: 'USD',
      position: 99,
      avg_cost: 1000,
      mark_price: 1000,
      unrealized_pnl: 0
    },
    {
      account: 'DU123456',
      contract_id: null,
      symbol: 'MESZ4',
      sec_type: 'FUT',
      exchange: 'CME',
      currency: 'USD',
      position: -2,
      avg_cost: 4750,
      mark_price: 4749,
      unrealized_pnl: 10
    },
    {
      account: 'du123456',
      contract_id: null,
      symbol: 'mesz4 ',
      sec_type: 'FUT',
      exchange: 'cme',
      currency: 'usd',
      position: -4,
      avg_cost: 4700,
      mark_price: 4700,
      unrealized_pnl: 0
    },
    {
      account: 'DU123456',
      contract_id: 202,
      symbol: 'ESZ4',
      sec_type: 'FUT',
      exchange: 'CME',
      currency: 'USD',
      position: 1,
      avg_cost: 4925,
      mark_price: 4930,
      unrealized_pnl: 25
    }
  ]
} as const satisfies Parameters<typeof mapAccountPositions>[0];

const mappedPositions = mapAccountPositions(positionsPayload);

assert(mappedPositions.length === 3, 'Duplicate contract and symbol entries should be removed');

const m2k = mappedPositions.find((item) => item.symbol === 'M2KZ4');
assert(m2k, 'Mapped positions should contain the original M2K contract');
assert(m2k?.quantity === 3, 'The first occurrence of a duplicate contract should be retained');
assert(m2k?.id === '101', 'Contract-based identifiers should use the numeric contract id');

const mes = mappedPositions.find((item) => item.symbol === 'MESZ4');
assert(mes, 'Mapped positions should contain the MES contract once');
assert(mes?.id === 'DU123456:MESZ4', 'Synthetic identifiers should fall back to account and symbol');

console.log('accountApi positions mapping deduplication tests passed');
