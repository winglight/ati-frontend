
import { resolveOrderActionStatus } from './orderLabels';
import { OrderItem } from '../features/dashboard/types';
import i18n from '../i18n';

// Mock OrderItem
const mockOrder = (notes: string): OrderItem => ({
  id: '1',
  symbol: 'TEST',
  status: 'filled',
  side: 'sell',
  type: 'market',
  quantity: 1,
  filled: 1,
  notes,
} as OrderItem);

const test = async () => {
  // Wait for i18n to init if necessary, though it's sync in the file.
  // Ensure language is zh
  await i18n.changeLanguage('zh');

  const notes = 'buy_the_dip_exit_sl | strategy_exit';
  const order = mockOrder(notes);
  const result = resolveOrderActionStatus(order);

  console.log(`Notes: "${notes}"`);
  console.log(`Result: "${result}"`);

  if (result === '平仓-止损') {
    console.log('PASS');
  } else {
    console.log('FAIL: Expected "平仓-止损"');
    process.exit(1);
  }
};

test().catch(err => {
  console.error(err);
  process.exit(1);
});
