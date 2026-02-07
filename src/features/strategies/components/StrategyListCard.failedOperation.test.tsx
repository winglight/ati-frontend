import React from 'react';
import { renderToString } from 'react-dom/server';
import StrategyListCard from './StrategyListCard.js';
import type { StrategyItem } from '@features/dashboard/types';

const assert = (condition: unknown, message: string): void => {
  if (!condition) {
    throw new Error(message);
  }
};

const failingStrategy: StrategyItem = {
  id: 'strategy-1',
  name: '测试策略',
  symbol: 'TEST',
  status: 'error',
  mode: 'paper',
  returnRate: 0,
  enabled: false,
  active: false
};

const failureReason = '风控拒绝了该操作';

const markup = renderToString(
  <StrategyListCard
    strategies={[failingStrategy]}
    selectedId={null}
    operations={{ [failingStrategy.id]: 'failed' }}
    operationErrors={{ [failingStrategy.id]: failureReason }}
    onSelect={() => undefined}
    onStart={() => undefined}
    onStop={() => undefined}
    onEdit={() => undefined}
  />
);

const normalized = markup.replace(/<!--.*?-->/gs, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

assert(
  normalized.includes('启动失败'),
  'StrategyListCard should render the failed badge when the latest operation failed'
);

assert(
  normalized.includes(failureReason),
  'StrategyListCard should render the failure reason from the store'
);

console.log('StrategyListCard failed operation test passed');
