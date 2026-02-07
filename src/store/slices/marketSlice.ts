import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import type {
  DepthSnapshot,
  MarketAvailability,
  MarketBar,
  MarketConnectionStatus,
  MarketKlineSnapshot,
  MarketSubscriptionState,
  MarketTickerSnapshot,
  SymbolInfo,
  TimeframeOption
} from '@features/dashboard/types';
import { initializeDashboard } from '@store/thunks/initializeDashboard';
import { fetchMarketSnapshot } from '@store/thunks/fetchMarketSnapshot';
import { dedupeMarketBars } from '@services/marketApi';

type RequestStatus = 'idle' | 'loading' | 'succeeded' | 'failed';

const MAX_KLINE_POINTS = Number.POSITIVE_INFINITY;

interface MarketState {
  depth: DepthSnapshot | null;
  symbols: SymbolInfo[];
  selectedSymbol: string | null;
  timeframes: TimeframeOption[];
  selectedTimeframe: string | null;
  kline: MarketKlineSnapshot | null;
  availability: MarketAvailability | null;
  ticker: MarketTickerSnapshot | null;
  status: RequestStatus;
  error?: string;
  lastSnapshotKey: string | null;
  lastSnapshotAt: number | null;
  lastSnapshotEmpty: boolean;
  subscription: MarketSubscriptionState;
}

const initialState: MarketState = {
  depth: null,
  symbols: [],
  selectedSymbol: null,
  timeframes: [],
  selectedTimeframe: null,
  kline: null,
  availability: null,
  ticker: null,
  status: 'idle',
  lastSnapshotKey: null,
  lastSnapshotAt: null,
  lastSnapshotEmpty: false,
  subscription: {
    status: 'idle',
    metadata: null,
    error: null,
    connectionStatus: 'idle'
  }
};

interface UpsertMarketBarPayload {
  bar: MarketBar;
  symbol?: string | null;
  timeframe?: string | null;
  intervalSeconds?: number;
  durationSeconds?: number;
}

const marketSlice = createSlice({
  name: 'market',
  initialState,
  reducers: {
    setSelectedSymbol(state, action: PayloadAction<string>) {
      state.selectedSymbol = action.payload;
    },
    setSelectedTimeframe(state, action: PayloadAction<string>) {
      state.selectedTimeframe = action.payload;
    },
    updateDepthSnapshot(state, action: PayloadAction<DepthSnapshot>) {
      state.depth = action.payload;
    },
    setMarketKlineSnapshot(state, action: PayloadAction<MarketKlineSnapshot | null>) {
      const snapshot = action.payload;
      if (!snapshot) {
        state.kline = null;
        return;
      }
      const nextBars = dedupeMarketBars(snapshot.bars ?? []);
      if (Number.isFinite(MAX_KLINE_POINTS) && nextBars.length > MAX_KLINE_POINTS) {
        nextBars.splice(0, nextBars.length - MAX_KLINE_POINTS);
      }
      const normalizedSnapshot: MarketKlineSnapshot = {
        ...snapshot,
        bars: nextBars,
        end: nextBars.length ? nextBars[nextBars.length - 1].timestamp : null
      };
      if (
        state.kline &&
        state.kline.symbol === normalizedSnapshot.symbol &&
        state.kline.timeframe === normalizedSnapshot.timeframe
      ) {
        const mergedBars = dedupeMarketBars([
          ...state.kline.bars,
          ...normalizedSnapshot.bars
        ]);
        if (Number.isFinite(MAX_KLINE_POINTS) && mergedBars.length > MAX_KLINE_POINTS) {
          mergedBars.splice(0, mergedBars.length - MAX_KLINE_POINTS);
        }
        state.kline = {
          ...state.kline,
          ...normalizedSnapshot,
          bars: mergedBars,
          end: mergedBars.length ? mergedBars[mergedBars.length - 1].timestamp : null
        };
      } else {
        state.kline = normalizedSnapshot;
      }
    },
    setMarketAvailability(state, action: PayloadAction<MarketAvailability | null>) {
      state.availability = action.payload;
    },
    setTickerSnapshot(state, action: PayloadAction<MarketTickerSnapshot | null>) {
      state.ticker = action.payload;
    },
    upsertMarketBar(state, action: PayloadAction<UpsertMarketBarPayload>) {
      const { bar, symbol, timeframe, intervalSeconds, durationSeconds } = action.payload;
      if (!state.kline) {
        state.kline = {
          symbol: symbol ?? state.selectedSymbol ?? '',
          timeframe: timeframe ?? state.selectedTimeframe ?? '',
          intervalSeconds: intervalSeconds ?? 0,
          durationSeconds: durationSeconds ?? 0,
          bars: [],
          end: null
        };
      }
      const snapshot = state.kline;
      if (!snapshot) {
        return;
      }
      if (symbol && symbol !== snapshot.symbol) {
        snapshot.symbol = symbol;
      }
      if (timeframe && timeframe !== snapshot.timeframe) {
        snapshot.timeframe = timeframe;
      }
      if (intervalSeconds !== undefined) {
        snapshot.intervalSeconds = intervalSeconds;
      }
      if (durationSeconds !== undefined) {
        snapshot.durationSeconds = durationSeconds;
      }
      const existingIndex = snapshot.bars.findIndex((item) => item.timestamp === bar.timestamp);
      let nextBars: MarketBar[];
      if (existingIndex >= 0) {
        nextBars = snapshot.bars.map((item, index) => (index === existingIndex ? bar : item));
      } else {
        nextBars = [...snapshot.bars, bar];
      }
      nextBars.sort((left, right) => Date.parse(left.timestamp) - Date.parse(right.timestamp));
      if (Number.isFinite(MAX_KLINE_POINTS) && nextBars.length > MAX_KLINE_POINTS) {
        nextBars = nextBars.slice(nextBars.length - MAX_KLINE_POINTS);
      }
      snapshot.bars = nextBars;
      snapshot.end = nextBars.length ? nextBars[nextBars.length - 1].timestamp : null;
    },
    setMarketSubscriptionPending(
      state,
      action: PayloadAction<{ symbol: string | null; timeframe: string | null; topics: string[] }>
    ) {
      state.subscription = {
        status: 'pending',
        error: null,
        metadata: {
          id: null,
          symbol: action.payload.symbol,
          timeframe: action.payload.timeframe,
          topics: action.payload.topics,
          capabilities: null
        },
        connectionStatus: state.subscription.connectionStatus === 'idle'
          ? 'connecting'
          : state.subscription.connectionStatus
      };
    },
    setMarketSubscriptionReady(
      state,
      action: PayloadAction<{
        id: string | null;
        symbol: string | null;
        timeframe: string | null;
        topics: string[];
        capabilities?: Record<string, unknown> | null;
      }>
    ) {
      state.subscription = {
        status: 'ready',
        error: null,
        metadata: {
          id: action.payload.id,
          symbol: action.payload.symbol,
          timeframe: action.payload.timeframe,
          topics: action.payload.topics,
          capabilities: action.payload.capabilities ?? null
        },
        connectionStatus: 'connected'
      };
    },
    setMarketSubscriptionFailed(
      state,
      action: PayloadAction<{ error: string; symbol: string | null; timeframe: string | null }>
    ) {
      const previousTopics = state.subscription.metadata?.topics ?? [];
      state.subscription = {
        status: 'failed',
        error: action.payload.error,
        metadata: {
          id: null,
          symbol: action.payload.symbol,
          timeframe: action.payload.timeframe,
          topics: previousTopics,
          capabilities: null
        },
        connectionStatus: 'failed'
      };
    },
    resetMarketSubscription(state) {
      state.subscription = {
        status: 'idle',
        error: null,
        metadata: null,
        connectionStatus: 'idle'
      };
    },
    setMarketConnectionStatus(
      state,
      action: PayloadAction<{ status: MarketConnectionStatus; error?: string | null }>
    ) {
      state.subscription.connectionStatus = action.payload.status;
      if (action.payload.error !== undefined) {
        state.subscription.error = action.payload.error;
      }
    }
  },
  extraReducers: (builder) => {
    builder
      .addCase(initializeDashboard.pending, (state) => {
        state.status = 'loading';
        state.error = undefined;
      })
      .addCase(initializeDashboard.fulfilled, (state, action) => {
        const { depth, symbols, selectedSymbol, timeframes, selectedTimeframe } =
          action.payload.snapshot;
        state.status = 'succeeded';
        state.depth = depth;
        state.symbols = symbols;
        state.selectedSymbol = selectedSymbol;
        state.timeframes = timeframes;
        state.selectedTimeframe = selectedTimeframe;
        state.kline = action.payload.snapshot.marketKline ?? state.kline;
        state.availability = action.payload.snapshot.marketAvailability ?? state.availability;
        state.ticker = action.payload.snapshot.marketTicker ?? state.ticker;
      })
      .addCase(initializeDashboard.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.error.message;
      })
      .addCase(fetchMarketSnapshot.pending, (state, action) => {
        state.status = 'loading';
        state.error = undefined;
        const { symbol, timeframe, durationSeconds } = action.meta.arg;
        state.lastSnapshotKey = `${symbol}__${timeframe}__${durationSeconds ?? ''}`;
        state.lastSnapshotAt = Date.now();
        state.lastSnapshotEmpty = false;
      })
      .addCase(fetchMarketSnapshot.fulfilled, (state, action) => {
        state.status = 'succeeded';
        if (action.payload.kline) {
          state.kline = action.payload.kline;
        }
        state.availability = action.payload.availability ?? null;
        state.ticker = action.payload.ticker ?? null;
        state.lastSnapshotEmpty = !action.payload.kline;
      })
      .addCase(fetchMarketSnapshot.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.error.message;
        state.lastSnapshotEmpty = false;
      });
  }
});

export const {
  setSelectedSymbol,
  setSelectedTimeframe,
  updateDepthSnapshot,
  setMarketKlineSnapshot,
  setMarketAvailability,
  setTickerSnapshot,
  upsertMarketBar,
  setMarketSubscriptionPending,
  setMarketSubscriptionReady,
  setMarketSubscriptionFailed,
  resetMarketSubscription,
  setMarketConnectionStatus
} = marketSlice.actions;

export default marketSlice.reducer;
