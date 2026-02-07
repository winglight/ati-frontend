const assert = (condition: unknown, message: string): void => {
  if (!condition) {
    throw new Error(message);
  }
};

const assertEqual = (left: unknown, right: unknown, message: string): void => {
  if (left !== right) {
    throw new Error(`${message}\nExpected: ${right}\nReceived: ${left}`);
  }
};

import { buildSparklinePath, buildMonthCells } from './visualUtils';

const sparklineEmpty = buildSparklinePath([]);
assertEqual(sparklineEmpty, '', 'Empty sparkline data should produce an empty path');

const sparklinePath = buildSparklinePath([
  { timestamp: '2024-05-01T00:00:00Z', value: 100 },
  { timestamp: '2024-05-01T01:00:00Z', value: 110 },
  { timestamp: '2024-05-01T02:00:00Z', value: 90 },
  { timestamp: '2024-05-01T03:00:00Z', value: 120 }
]);

assert(
  sparklinePath.startsWith('M 0.00'),
  `Sparkline path should start with a move command, received: ${sparklinePath}`
);
assert(
  sparklinePath.includes('L 100.00'),
  `Sparkline path should include the final point at x=100, received: ${sparklinePath}`
);

const calendarCells = buildMonthCells({
  year: 2024,
  month: 5,
  timezone: 'UTC',
  days: [
    { date: '2024-05-01', pnl: 1200 },
    { date: '2024-05-03', pnl: -400 }
  ]
});

assertEqual(calendarCells[0]?.type, 'empty', 'Calendar should include leading empty cells before May 1st, 2024');
const firstDay = calendarCells[3];
if (firstDay?.type === 'day') {
  assertEqual(firstDay.day, 1, 'First calendar cell should represent day 1');
  assertEqual(firstDay.pnl, 1200, 'Day 1 PnL should match the provided value');
}
const thirdDay = calendarCells[5];
if (thirdDay?.type === 'day') {
  assertEqual(thirdDay.day, 3, 'Third calendar entry should map to day 3');
  assertEqual(thirdDay.pnl, -400, 'Day 3 PnL should match the provided value');
}

assertEqual(
  calendarCells.length % 7,
  0,
  'Calendar grid should contain a multiple of seven cells to fill the grid rows'
);

console.log('Strategy visual utils tests passed');
