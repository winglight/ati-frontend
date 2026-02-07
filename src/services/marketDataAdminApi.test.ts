import { __TESTING__ } from './marketDataAdminApi.js';
import { __TESTING__ as modalTesting } from '../components/modals/MarketDataModal.js';
import type { MarketDataRangeEntryPayload } from './marketDataAdminApi';

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

const entries: MarketDataRangeEntryPayload[] = [
  {
    symbol: 'ES',
    data_type: 'bar_1m',
    start: '2023-01-01T00:00:00Z',
    end: '2023-01-10T00:00:00Z',
    file_count: 10,
    total_size: 1024 * 1024,
    metadata: {
      volume: 123456,
      records: 50000,
      updated_at: '2023-01-11T00:00:00Z'
    }
  },
  {
    symbol: 'ES',
    data_type: 'bar_1d',
    start: '2022-12-25T00:00:00Z',
    end: '2023-01-12T00:00:00Z',
    metadata: {
      stats: {
        file_count: 5,
        total_size: 2048 * 1024,
        total_volume: 654321,
        record_count: 800
      },
      updatedAt: '2023-01-13T12:34:56Z'
    }
  },
  {
    symbol: 'ES',
    data_type: 'bar_5m',
    path: '/data/market-data/bar_5m/symbol=ES/20221224_000000-20221224_235959.parquet',
    size_bytes: 256 * 1024,
    metadata: {
      stats: {
        updated_at: '2022-12-24T23:59:59Z'
      }
    }
  },
  {
    symbol: 'ES',
    data_type: 'dom_depth',
    start: '2023-01-05T00:00:00Z',
    end: '2023-01-08T00:00:00Z',
    file_count: 3,
    size_bytes: 512 * 1024,
    metadata: {
      summary: {
        volume: 9999,
        records: 1200
      },
      last_updated_at: '2023-01-08T12:00:00Z'
    }
  },
  {
    symbol: 'ES',
    data_type: 'dom_snapshot',
    path: '/data/market-data/dom/symbol=ES/20230108T000000Z-20230110T000500Z.parquet',
    size_bytes: 128 * 1024,
    metadata: {
      stats: {
        records: 2400
      },
      lastModified: '2023-01-10T01:05:00Z'
    }
  },
  {
    symbol: 'NQ',
    data_type: 'bar_1m',
    start: '2023-01-01T00:00:00Z',
    end: '2023-01-02T00:00:00Z',
    file_count: 1,
    total_size: 10
  }
];

const result = __TESTING__.aggregateCoverageBySymbol(entries, 'ES');

assertEqual(result.symbol, 'ES', 'aggregateCoverageBySymbol should preserve requested symbol');
assert(result.bars, 'aggregateCoverageBySymbol should collect bar statistics');
assert(result.dom, 'aggregateCoverageBySymbol should collect DOM statistics');

const { bars, dom } = result;

if (!bars || !dom) {
  throw new Error('aggregateCoverageBySymbol should return bar and DOM stats');
}

assertEqual(bars.start, '2022-12-24T00:00:00.000Z', 'Bar stats should track earliest start timestamp');
assertEqual(bars.end, '2023-01-12T00:00:00.000Z', 'Bar stats should track latest end timestamp');
assertEqual(bars.fileCount, 16, 'Bar stats should sum file counts');
assertEqual(bars.totalSize, 3_407_872, 'Bar stats should sum total sizes');
assertEqual(bars.totalVolume, 777_777, 'Bar stats should sum total volume');
assertEqual(bars.recordCount, 50_800, 'Bar stats should sum record counts');

assertEqual(dom.start, '2023-01-05T00:00:00.000Z', 'DOM stats should track earliest start timestamp');
assertEqual(dom.end, '2023-01-10T00:05:00.000Z', 'DOM stats should track latest end timestamp');
assertEqual(dom.fileCount, 4, 'DOM stats should sum file counts');
assertEqual(dom.totalSize, 655_360, 'DOM stats should aggregate total size');
assertEqual(dom.totalVolume, 9_999, 'DOM stats should sum total volume');
assertEqual(dom.recordCount, 1_200, 'DOM stats should sum record counts');

const normalizedEntries = __TESTING__.normaliseRangeEntries(entries, 'ES');
assertEqual(normalizedEntries.length, 5, 'normaliseRangeEntries should include all entries for symbol');

const firstEntry = normalizedEntries[0];
assertEqual(firstEntry.dataType, 'bar_5m', 'Entries should be sorted by ascending start timestamp');
assertEqual(
  firstEntry.start,
  '2022-12-24T00:00:00.000Z',
  'normaliseRangeEntries should parse start timestamp from path when missing'
);
assertEqual(
  firstEntry.end,
  '2022-12-24T23:59:59.000Z',
  'normaliseRangeEntries should parse end timestamp from path when missing'
);

const domSnapshotEntry = normalizedEntries.find((item) => item.dataType === 'dom_snapshot');
assert(domSnapshotEntry, 'normaliseRangeEntries should keep DOM snapshot entries');
if (!domSnapshotEntry) {
  throw new Error('Expected DOM snapshot entry to exist');
}
assertEqual(
  domSnapshotEntry.updatedAt,
  '2023-01-10T01:05:00.000Z',
  'normaliseRangeEntries should surface updatedAt metadata'
);

const barOneMinuteEntry = normalizedEntries.find((item) => item.dataType === 'bar_1m');
assert(barOneMinuteEntry, 'normaliseRangeEntries should preserve primary interval entries');
if (!barOneMinuteEntry) {
  throw new Error('Expected bar_1m entry to exist');
}
assertEqual(
  barOneMinuteEntry.recordCount,
  50_000,
  'normaliseRangeEntries should expose record counts from metadata'
);
assertEqual(
  barOneMinuteEntry.path,
  null,
  'normaliseRangeEntries should omit path when not provided'
);

console.log('marketDataAdminApi aggregation tests passed');

const defaultWindow = modalTesting.resolveBackfillWindow(null);
assertEqual(defaultWindow.value, 1, 'Default backfill window should be 1 year');
assertEqual(defaultWindow.unit, 'year', 'Default backfill window should use year unit');

const stockWindow = modalTesting.resolveBackfillWindow('STK');
assertEqual(stockWindow.value, 10, 'Stock backfill window should be 10 years');
assertEqual(stockWindow.unit, 'year', 'Stock backfill window should use year unit');

const futuresWindow = modalTesting.resolveBackfillWindow('FUT');
assertEqual(futuresWindow.value, 3, 'Futures backfill window should be 3 months');
assertEqual(futuresWindow.unit, 'month', 'Futures backfill window should use month unit');

assertEqual(
  modalTesting.toTimeframe('1m'),
  'bar_1m',
  'Interval without prefix should be normalized to bar_ prefixed timeframe'
);
assertEqual(
  modalTesting.toTimeframe('bar_5m'),
  'bar_5m',
  'Prefixed interval should remain unchanged when generating timeframe'
);

console.log('MarketDataModal helper tests passed');
