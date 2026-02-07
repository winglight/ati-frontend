import { createAsyncThunk } from '@reduxjs/toolkit';
import type { RootState } from '@store/index';
import type { MarketSnapshotResult } from '@services/marketApi';
import { loadMarketSnapshot } from '@services/marketApi';

export interface FetchMarketSnapshotArgs {
  symbol: string;
  timeframe: string;
  durationSeconds?: number;
  refreshAvailability?: boolean;
  force?: boolean;
}

export type FetchMarketSnapshotPayload = MarketSnapshotResult & {
  symbol: string;
  timeframe: string;
};

const SNAPSHOT_REQUEST_COOLDOWN_MS = 5000;
const EMPTY_SNAPSHOT_COOLDOWN_MS = 60000;

const buildSnapshotKey = (args: FetchMarketSnapshotArgs): string =>
  `${args.symbol}__${args.timeframe}__${args.durationSeconds ?? ''}`;

export const fetchMarketSnapshot = createAsyncThunk<
  FetchMarketSnapshotPayload,
  FetchMarketSnapshotArgs,
  { state: RootState }
>(
  'market/fetchSnapshot',
  async ({ symbol, timeframe, durationSeconds, refreshAvailability }, thunkAPI) => {
  const state = thunkAPI.getState();
  const token = state.auth.token;
  if (!token) {
    throw new Error('缺少访问令牌，无法获取行情数据');
  }

  const snapshot = await loadMarketSnapshot(token, {
    symbol,
    timeframe,
    durationSeconds,
    refreshAvailability,
    ownerId: state.realtime.clientId ? `ws:${state.realtime.clientId}` : undefined
  });

  return {
    ...snapshot,
    symbol,
    timeframe
  };
},
  {
    condition: (args, { getState }) => {
      if (args.force) {
        return true;
      }
      const state = getState();
      const market = state.market;
      if (market.status === 'loading') {
        return false;
      }
      const key = buildSnapshotKey(args);
      if (!market.lastSnapshotAt || market.lastSnapshotKey !== key) {
        return true;
      }
      const now = Date.now();
      const elapsed = now - market.lastSnapshotAt;
      const cooldown = market.lastSnapshotEmpty
        ? EMPTY_SNAPSHOT_COOLDOWN_MS
        : SNAPSHOT_REQUEST_COOLDOWN_MS;
      return elapsed >= cooldown;
    }
  }
);
