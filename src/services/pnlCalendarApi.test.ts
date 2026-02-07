const assertEqual = (actual: unknown, expected: unknown, message: string): void => {
  if (actual !== expected) {
    throw new Error(`${message}\nExpected: ${expected}\nReceived: ${actual}`);
  }
};

import type { OrderItem } from '@features/dashboard/types';
import { mapPnLCalendarTrades } from './pnlCalendarApi.js';

const createOrder = (id: string, executedAt: string): OrderItem => ({
  id,
  symbol: 'MES',
  side: 'buy',
  type: 'market',
  quantity: 1,
  filled: 1,
  status: 'filled',
  source: 'test',
  updatedAt: executedAt,
  executedAt,
  pnl: 100,
  realizedPnl: 100
});

const mapped = mapPnLCalendarTrades([
  createOrder('1', '2026-01-12T00:30:00Z'),
  createOrder('2', '2026-01-14T15:30:00Z'),
  createOrder('3', '2026-01-10T15:30:00Z')
]);

assertEqual(
  mapped[0]?.TradeDate,
  '2026-01-12',
  'Sunday evening session should roll forward to Monday trade date'
);
assertEqual(mapped[1]?.TradeDate, '2026-01-14', 'Weekday trade date should remain unchanged');
assertEqual(
  mapped[2]?.TradeDate,
  '2026-01-09',
  'Saturday trade date should roll back to Friday to avoid weekend calendar entries'
);

console.log('pnlCalendarApi trade-date mapping tests passed');
