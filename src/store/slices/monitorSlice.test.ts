const assert = (condition: unknown, message: string): void => {
  if (!condition) {
    throw new Error(message);
  }
};

const assertDeepEqual = (left: unknown, right: unknown, message: string): void => {
  const normalize = (value: unknown): unknown => {
    if (Array.isArray(value)) {
      return value.map(normalize);
    }
    if (value && typeof value === 'object') {
      return Object.keys(value as Record<string, unknown>)
        .sort()
        .reduce<Record<string, unknown>>((acc, key) => {
          acc[key] = normalize((value as Record<string, unknown>)[key]);
          return acc;
        }, {});
    }
    return value;
  };

  const leftJson = JSON.stringify(normalize(left));
  const rightJson = JSON.stringify(normalize(right));
  if (leftJson !== rightJson) {
    throw new Error(`${message}\nExpected: ${rightJson}\nReceived: ${leftJson}`);
  }
};

import monitorReducer from './monitorSlice';
import { setMarketSubscriptionReady, updateDepthSnapshot } from './marketSlice';
import type { DepthSnapshot } from '@features/dashboard/types';

const ackPayload = {
  id: 'sub-1',
  symbol: 'ESM4',
  timeframe: '1m',
  topics: [] as string[]
};

let state = monitorReducer(undefined, { type: 'monitor/init' });
state = monitorReducer(state, setMarketSubscriptionReady(ackPayload));

const firstSnapshot: DepthSnapshot = {
  symbol: 'ESM4',
  bids: [
    { price: 5200, size: 12 },
    { price: 5199.75, size: 8 }
  ],
  asks: [
    { price: 5200.25, size: 10 },
    { price: 5200.5, size: 6 }
  ],
  updatedAt: '2024-01-01T00:00:00.000Z'
};

state = monitorReducer(state, updateDepthSnapshot(firstSnapshot));

assert(state.hasInitialSnapshot === true, 'monitor should mark initial snapshot after first depth update');
assert(state.domSeries.length === 1, 'dom series should capture first snapshot point');

const domSeriesReference = state.domSeries;
const firstPoint = state.domSeries[0];

state = monitorReducer(state, setMarketSubscriptionReady(ackPayload));

assert(state.domSeries.length === 1, 'dom series should retain points on duplicate subscription ready event');
assertDeepEqual(state.domSeries[0], firstPoint, 'first dom point should remain intact after duplicate subscription ready');
assert(state.domSeries === domSeriesReference, 'dom series array reference should remain stable without resets');
assert(state.hasInitialSnapshot === true, 'hasInitialSnapshot should remain true after duplicate subscription ready event');

const secondSnapshot: DepthSnapshot = {
  symbol: 'ESM4',
  bids: [
    { price: 5200.5, size: 14 },
    { price: 5200.25, size: 6 }
  ],
  asks: [
    { price: 5200.75, size: 7 },
    { price: 5201, size: 5 }
  ],
  updatedAt: '2024-01-01T00:00:01.000Z'
};

state = monitorReducer(state, updateDepthSnapshot(secondSnapshot));

assert(state.domSeries.length === 2, 'dom series should continue accumulating after duplicate subscription ready event');
assertDeepEqual(state.domSeries[0], firstPoint, 'first dom point should persist after additional snapshots');
assert(state.hasInitialSnapshot === true, 'hasInitialSnapshot should stay true after processing additional depth snapshots');
