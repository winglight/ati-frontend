import React from 'react';
import { renderToString } from 'react-dom/server';
import OrdersPanel from './OrdersPanel.js';
import type { OrderItem } from '../types';
import { formatLocalDateTime } from '../../../utils/dateTime.js';

const assert = (condition: unknown, message: string): void => {
  if (!condition) {
    throw new Error(message);
  }
};

const sampleOrder: OrderItem = {
  id: 'order-1',
  symbol: 'ES',
  side: 'buy',
  type: 'limit',
  quantity: 1,
  filled: 0,
  status: 'working',
  source: 'manual',
  updatedAt: '2024-06-15T12:34:56Z'
};

const lastSyncedAt = '2024-06-15T12:30:00Z';
const expectedSyncLabel = formatLocalDateTime(lastSyncedAt);

const rendered = renderToString(
  <OrdersPanel
    orders={[sampleOrder]}
    onSelectSymbol={() => undefined}
    onViewDetail={() => undefined}
    onCreateOrder={() => undefined}
    lastUpdated={lastSyncedAt}
  />
);

const normalizedText = rendered
  .replace(/<!--.*?-->/gs, '')
  .replace(/<[^>]+>/g, '')
  .replace(/\s+/g, ' ')
  .trim();

assert(
  normalizedText.includes('最新同步'),
  'OrdersPanel should render the latest sync label'
);

assert(
  normalizedText.includes(expectedSyncLabel),
  'OrdersPanel should render the last synced timestamp using localized formatter'
);

// Verify that cancelled orders are hidden when scope is default "active"
const cancelledOrder: OrderItem = {
  ...sampleOrder,
  id: 'order-2',
  symbol: 'CANCEL1',
  status: 'cancelled',
  updatedAt: '2024-06-15T12:35:00Z'
};

const renderedCancelledOnly = renderToString(
  <OrdersPanel
    orders={[cancelledOrder]}
    onSelectSymbol={() => undefined}
    onViewDetail={() => undefined}
    onCreateOrder={() => undefined}
    lastUpdated={lastSyncedAt}
  />
);

const normalizedCancelledOnly = renderedCancelledOnly
  .replace(/<!--.*?-->/gs, '')
  .replace(/<[^>]+>/g, '')
  .replace(/\s+/g, ' ')
  .trim();

assert(
  !normalizedCancelledOnly.includes('已撤销'),
  'Cancelled orders should not appear under the default "有效" filter'
);
assert(
  normalizedCancelledOnly.includes('暂无委托记录'),
  'OrdersPanel should show empty state when only cancelled orders exist under "有效" filter'
);

console.log('OrdersPanel component test passed');
