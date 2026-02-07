import React from 'react';
import { renderToString } from 'react-dom/server';
import OrderSummaryCard from './OrderSummaryCard.js';
import type { OrderItem } from '../features/dashboard/types';
import { formatLocalDateTime } from '../utils/dateTime.js';

const assert = (condition: unknown, message: string): void => {
  if (!condition) {
    throw new Error(message);
  }
};

const baseOrder: OrderItem = {
  id: 'order-1',
  symbol: 'ES',
  side: 'buy',
  type: 'limit',
  quantity: 2,
  filled: 1,
  status: 'working',
  source: 'manual',
  updatedAt: '2024-06-15T12:34:56Z',
  createdAt: '2024-06-15T11:34:56Z',
  executedAt: null,
  account: 'DU123456',
  exchange: 'CME',
  secType: 'FUT',
  commission: 1.5,
  pnl: 12.34,
  realizedPnl: 5.67,
  unrealizedPnl: 6.67,
  strategy: 'strategy-alpha',
  strategyName: 'Alpha Strategy',
  limitPrice: 4200,
  price: 4200,
  fillPrice: null,
  orderSource: 'dashboard'
};

const makeOrder = (overrides: Partial<OrderItem>): OrderItem => ({
  ...baseOrder,
  ...overrides
});

const renderOrder = (order: OrderItem): string =>
  renderToString(<OrderSummaryCard order={order} onSelectSymbol={() => undefined} />);

const manualOrder = makeOrder({ source: 'manual', orderSource: 'dashboard' });
const manualRender = renderOrder(manualOrder);
assert(
  manualRender.includes('手动'),
  'Manual orders should display Manual origin label without prefix'
);

const riskOrder = makeOrder({ source: 'risk', orderSource: 'risk', ruleId: 'TP' });
const riskRender = renderOrder(riskOrder);
assert(
  riskRender.includes('风控-止盈'),
  'Risk orders should display 风控 origin label derived from rule ID'
);

const strategyOrder = makeOrder({ source: 'strategy', orderSource: 'strategy' });
const strategyRender = renderOrder(strategyOrder);
assert(
  strategyRender.includes('策略-') && strategyRender.includes('Alpha Strategy'),
  'Strategy orders should display 策略 origin label with strategy name'
);

const protectiveStopOrder = makeOrder({
  source: 'risk',
  orderSource: 'risk',
  ruleId: 'protective_stop',
  notes: 'auto_stop:loss_breach'
});
const protectiveStopRender = renderOrder(protectiveStopOrder);
assert(
  protectiveStopRender.includes('风控-止损（亏损超限）'),
  'Protective stop orders should append auto stop reason to origin label'
);

const unknownAutoStopOrder = makeOrder({
  source: 'strategy',
  orderSource: 'strategy',
  notes: 'auto_stop:custom_reason'
});
const unknownAutoStopRender = renderOrder(unknownAutoStopOrder);
assert(
  unknownAutoStopRender.includes('策略-') &&
    unknownAutoStopRender.includes('Alpha Strategy（自动止损（custom_reason））'),
  'Orders with unknown auto stop reason should fall back to displaying the code'
);

const expectedTimestamp = formatLocalDateTime(baseOrder.createdAt);
assert(
  strategyRender.includes(`创建时间 ${expectedTimestamp}`),
  'OrderSummaryCard should render created timestamp when not filled'
);

const filledTodayOrder = makeOrder({ status: 'filled', executedAt: new Date().toISOString() });
const filledTodayRender = renderOrder(filledTodayOrder);
assert(
  !filledTodayRender.includes('撤单'),
  'Filled orders should not render cancel button'
);
assert(
  filledTodayRender.includes('今天') || filledTodayRender.includes('Today'),
  'Filled orders should render executed-day tag (today)'
);

const strategyStopLossOrder = makeOrder({
  source: 'strategy',
  orderSource: 'strategy',
  notes: 'buy_the_dip_exit_sl | strategy_exit'
});
const strategyStopLossRender = renderOrder(strategyStopLossOrder);
assert(
  strategyStopLossRender.includes('平仓-止损'),
  'Strategy orders with stop loss notes should display 平仓-止损'
);

const strategyTakeProfitOrder = makeOrder({
  source: 'strategy',
  orderSource: 'strategy',
  notes: 'buy_the_dip_exit_tp | strategy_exit'
});
const strategyTakeProfitRender = renderOrder(strategyTakeProfitOrder);
assert(
  strategyTakeProfitRender.includes('平仓-止盈'),
  'Strategy orders with take profit notes should display 平仓-止盈'
);

console.log('OrderSummaryCard component test passed');
