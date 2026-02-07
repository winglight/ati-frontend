const assert = (condition: unknown, message: string): void => {
  if (!condition) {
    throw new Error(message);
  }
};

import reducer, { setPositions, updatePositionPricing } from './accountSlice.js';
import { setTickerSnapshot as setMarketTickerSnapshot } from './marketSlice.js';

const createBaseState = () => reducer(undefined, { type: '@@INIT' });

const shortPosition = {
  id: 'short-1',
  symbol: 'ESM4',
  direction: 'short' as const,
  quantity: 2,
  avgPrice: 100,
  markPrice: 100,
  pnl: 0,
  multiplier: 1
};

const stateWithShort = reducer(createBaseState(), setPositions([shortPosition]));

const updated = reducer(stateWithShort, updatePositionPricing({ symbol: 'ESM4', price: 110 }));
const updatedPosition = updated.positions[0];

assert(updatedPosition.pnl === -20, 'Short positions should lose value when price rises');
assert(updatedPosition.markPrice === 110, 'Short position mark price should update with latest price');

const mnqPosition = {
  id: 'mnq-1',
  symbol: 'MNQZ4',
  direction: 'long' as const,
  quantity: 1,
  avgPrice: 15000,
  markPrice: 15000,
  pnl: 0,
  multiplier: 2
};

const mnqState = reducer(createBaseState(), setPositions([mnqPosition]));
const mnqUpdated = reducer(mnqState, updatePositionPricing({ symbol: 'MNQZ4', price: 15001 }));
const mnqUpdatedPosition = mnqUpdated.positions[0];

assert(mnqUpdatedPosition.pnl === 2, 'MNQ positions should gain $2 per point when price rises by one point');
assert(mnqUpdatedPosition.markPrice === 15001, 'MNQ mark price should update to the latest price');

const rootPosition = {
  id: 'es-root-1',
  symbol: 'ES',
  direction: 'long' as const,
  quantity: 1,
  avgPrice: 4200,
  markPrice: 4200,
  pnl: 0,
  multiplier: 1
};

const rootState = reducer(createBaseState(), setPositions([rootPosition]));
const rootPricingUpdated = reducer(
  rootState,
  updatePositionPricing({ symbol: 'ESM4', price: 4210 })
);
const rootPricingPosition = rootPricingUpdated.positions[0];

assert(rootPricingPosition.markPrice === 4210, 'Root symbol positions should update with month symbol pricing');
assert(rootPricingPosition.pnl === 10, 'Root symbol pricing should compute floating PnL against month symbol updates');

const tickerState = reducer(createBaseState(), setPositions([rootPosition]));
const tickerUpdated = reducer(
  tickerState,
  setMarketTickerSnapshot({
    symbol: 'ESM4',
    last: 4220,
    close: 4200,
    bid: 4219.75,
    ask: 4220.25
  } as Parameters<typeof setMarketTickerSnapshot>[0])
);
const tickerUpdatedPosition = tickerUpdated.positions[0];

assert(
  tickerUpdatedPosition.markPrice === 4220,
  'Ticker snapshots using month symbols should update root symbol positions'
);
assert(
  tickerUpdatedPosition.pnl === 20,
  'Ticker snapshots should compute PnL updates for root symbol positions when month symbol snapshots arrive'
);

const m2kRootPosition = {
  id: 'm2k-root-1',
  symbol: 'M2K',
  direction: 'long' as const,
  quantity: 3,
  avgPrice: 1800.0,
  markPrice: 1800.0,
  pnl: 0,
  multiplier: 5
};

const m2kRootState = reducer(createBaseState(), setPositions([m2kRootPosition]));
const m2kPricingUpdated = reducer(
  m2kRootState,
  updatePositionPricing({ symbol: 'M2KZ5', price: 1800.1 })
);
const m2kPricingPosition = m2kPricingUpdated.positions[0];

assert(
  m2kPricingPosition.markPrice === 1800.1,
  'M2K root positions should update with month symbol pricing'
);
assert(
  m2kPricingPosition.pnl === 1.5,
  'M2K pricing should compute floating PnL correctly for long positions'
);

const m2kTickerState = reducer(createBaseState(), setPositions([m2kRootPosition]));
const m2kTickerUpdated = reducer(
  m2kTickerState,
  setMarketTickerSnapshot({
    symbol: 'M2KZ5',
    last: 1800.2,
    close: 1800.0,
    bid: 1800.15,
    ask: 1800.25
  } as Parameters<typeof setMarketTickerSnapshot>[0])
);
const m2kTickerPosition = m2kTickerUpdated.positions[0];

assert(
  m2kTickerPosition.markPrice === 1800.2,
  'Ticker snapshots using month symbols should update M2K root positions'
);
assert(
  m2kTickerPosition.pnl === 3,
  'Ticker snapshots should compute PnL updates for M2K root positions'
);

console.log('accountSlice floating PnL tests passed');
