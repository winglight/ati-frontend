import { __TESTING__ } from './initializeDashboard.js';
import type {
  DashboardData,
  PositionItem,
  SymbolInfo
} from '@features/dashboard/types';

const { resolveInitialSymbol } = __TESTING__;

const assertEqual = (actual: unknown, expected: unknown, message: string): void => {
  if (actual !== expected) {
    throw new Error(`${message}\nExpected: ${expected}\nReceived: ${actual}`);
  }
};

const createSymbolInfo = (symbol: string): SymbolInfo => ({
  symbol,
  description: symbol,
  exchange: '—',
  tickSize: null,
  secType: null,
  domCapable: null
});

const createPosition = (symbol: string): PositionItem => ({
  id: `${symbol}-position`,
  symbol,
  direction: 'long',
  quantity: 1,
  avgPrice: 1,
  markPrice: 1,
  pnl: 0
});

const createOrder = (symbol: string): DashboardData['orders'][number] => ({
  id: `${symbol}-order`,
  symbol,
  side: 'buy',
  type: 'limit',
  quantity: 1,
  filled: 0,
  status: 'working',
  source: 'test',
  updatedAt: '2024-01-01T00:00:00.000Z'
});

const createStrategy = (symbol: string): DashboardData['strategies'][number] => ({
  id: `${symbol}-strategy`,
  name: `${symbol} strategy`,
  symbol,
  status: 'running',
  mode: 'live',
  returnRate: 0
});

(() => {
  const symbols = [createSymbolInfo('ES'), createSymbolInfo('MNQ')];
  const positions = [createPosition('ES')];
  const orders = [createOrder('MES')];
  const strategies = [createStrategy('RTY')];

  const preferredResult = resolveInitialSymbol({
    preferredSymbol: ' MNQ ',
    symbols,
    positions,
    orders,
    strategies
  });
  assertEqual(preferredResult, 'MNQ', 'Preferred symbol should take precedence over other candidates');

  const positionResult = resolveInitialSymbol({
    preferredSymbol: null,
    symbols,
    positions,
    orders,
    strategies
  });
  assertEqual(positionResult, 'ES', 'Positions should be considered when no preferred symbol is provided');

  const orderResult = resolveInitialSymbol({
    preferredSymbol: null,
    symbols,
    positions: [],
    orders,
    strategies
  });
  assertEqual(orderResult, 'MES', 'Orders should provide the next fallback when no positions are available');

  const strategyResult = resolveInitialSymbol({
    preferredSymbol: null,
    symbols,
    positions: [],
    orders: [],
    strategies
  });
  assertEqual(
    strategyResult,
    'RTY',
    'Strategies should be used when positions and orders are unavailable'
  );

  const directoryResult = resolveInitialSymbol({
    preferredSymbol: null,
    symbols,
    positions: [],
    orders: [],
    strategies: []
  });
  assertEqual(
    directoryResult,
    'ES',
    'Symbol directory ordering should be used as the final fallback'
  );

  console.log('initializeDashboard selection tests passed');
})();
