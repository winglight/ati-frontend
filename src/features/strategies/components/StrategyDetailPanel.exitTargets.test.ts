import { computeFixedRrTargets } from './exitTargets.js';

const assert = (condition: unknown, message: string): void => {
  if (!condition) {
    throw new Error(message);
  }
};

const assertEqual = (left: unknown, right: unknown, message: string): void => {
  if (left !== right) {
    throw new Error(`${message}\nExpected: ${String(right)}\nReceived: ${String(left)}`);
  }
};

const buyTargets = computeFixedRrTargets({ entryPrice: 100, side: 'BUY', riskAmount: 5, rrRatio: 3 });
assertEqual(buyTargets.sl, 95, 'Buy stop loss should subtract the absolute risk delta');
assertEqual(buyTargets.tp, 115, 'Buy take profit should add the absolute risk delta times RR');

const sellTargets = computeFixedRrTargets({ entryPrice: 250, side: 'SELL', riskAmount: 10, rrRatio: 2 });
assertEqual(sellTargets.sl, 260, 'Sell stop loss should add the absolute risk delta');
assertEqual(sellTargets.tp, 230, 'Sell take profit should subtract the scaled absolute risk delta');

const clampedTargets = computeFixedRrTargets({ entryPrice: 75, side: 'BUY', riskAmount: 3, rrRatio: -1 });
assertEqual(clampedTargets.sl, 72, 'Negative RR ratios should still compute stop loss from cost');
assertEqual(clampedTargets.tp, 75, 'Negative RR ratios should clamp take profit scaling to zero');

assert(
  computeFixedRrTargets({ entryPrice: null, side: 'BUY', riskAmount: 5, rrRatio: 2 }).sl === null,
  'Missing entry price should yield null targets'
);
assert(
  computeFixedRrTargets({ entryPrice: 100, side: null, riskAmount: 5, rrRatio: 2 }).sl === null,
  'Missing side should yield null targets'
);
assert(
  computeFixedRrTargets({ entryPrice: 100, side: 'BUY', riskAmount: null, rrRatio: 2 }).sl === null,
  'Missing risk amount should yield null targets'
);
assert(
  computeFixedRrTargets({ entryPrice: 100, side: 'BUY', riskAmount: 5, rrRatio: null }).sl === null,
  'Missing RR ratio should yield null targets'
);
