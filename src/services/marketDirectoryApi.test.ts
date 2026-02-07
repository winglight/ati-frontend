import { __TESTING__ } from './marketDirectoryApi.js';

const _assert = (condition: unknown, message: string): void => {
  if (!condition) {
    throw new Error(message);
  }
};

const assertEqual = (left: unknown, right: unknown, message: string): void => {
  if (left !== right) {
    throw new Error(`${message}\nExpected: ${right}\nReceived: ${left}`);
  }
};

const { normaliseSymbolValue, extractSymbolFromPath } = __TESTING__;

const directSymbol = normaliseSymbolValue('ESM4');
assertEqual(directSymbol, 'ESM4', 'normaliseSymbolValue should keep regular symbols');

const prefixedSymbol = normaliseSymbolValue('symbol=ESU4');
assertEqual(prefixedSymbol, 'ESU4', 'normaliseSymbolValue should strip symbol prefix');

const numericSegment = normaliseSymbolValue('20240414');
assertEqual(numericSegment, null, 'normaliseSymbolValue should ignore purely numeric segments');

const extracted = extractSymbolFromPath('/data/market/ESM4/2024/04/14/bars.json');
assertEqual(extracted, 'ESM4', 'extractSymbolFromPath should locate symbols before date segments');

const legacyExtracted = extractSymbolFromPath('/data/market/symbol=ESM4/2024/04/14/bars.json');
assertEqual(legacyExtracted, 'ESM4', 'extractSymbolFromPath should remain compatible with legacy symbol= prefixes');

console.log('marketDirectoryApi helpers tests passed');
