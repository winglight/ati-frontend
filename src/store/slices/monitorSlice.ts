import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import type { DepthSnapshot, DomSignal, DomTrendPoint } from '@features/dashboard/types';
import { extractRootSymbol } from '@features/dashboard/utils/priceFormatting';
import { initializeDashboard } from '@store/thunks/initializeDashboard';
import {
  setMarketSubscriptionReady,
  setSelectedSymbol,
  setSelectedTimeframe,
  updateDepthSnapshot
} from './marketSlice';

const DOM_SERIES_LIMIT = 240;
const DOM_SIGNAL_LIMIT = 20;

interface MonitorState {
  active: boolean;
  duration: string;
  domSeries: DomTrendPoint[];
  signals: DomSignal[];
  symbolRoot: string | null;
  hasInitialSnapshot: boolean;
}

const initialState: MonitorState = {
  active: false,
  duration: '1D',
  domSeries: [],
  signals: [],
  symbolRoot: null,
  hasInitialSnapshot: false
};

const toNumber = (value: unknown): number => {
  if (typeof value !== 'number') {
    return 0;
  }
  if (!Number.isFinite(value)) {
    return 0;
  }
  return value;
};

const aggregateDepth = (snapshot: DepthSnapshot | null | undefined) => {
  if (!snapshot) {
    return { bids: 0, asks: 0, timestamp: Date.now() };
  }
  const bidsTotal =
    snapshot.totalBidSize != null ? toNumber(snapshot.totalBidSize) : (snapshot.bids ?? []).reduce((acc, entry) => acc + toNumber(entry.size), 0);
  const asksTotal =
    snapshot.totalAskSize != null ? toNumber(snapshot.totalAskSize) : (snapshot.asks ?? []).reduce((acc, entry) => acc + toNumber(entry.size), 0);
  const bids = bidsTotal;
  const asks = asksTotal;
  const timestamp = snapshot.updatedAt ? Date.parse(snapshot.updatedAt) || Date.now() : Date.now();
  return { bids, asks, timestamp };
};

const formatSignalText = (type: DomSignal['type']): string => {
  return type === 'buy' ? '多头动能增强' : '空头动能增强';
};

const ingestSnapshot = (state: MonitorState, snapshot: DepthSnapshot | null | undefined) => {
  if (!state.active) {
    return;
  }
  const snapshotRoot = extractRootSymbol(snapshot?.symbol ?? null);
  if (snapshotRoot) {
    if (state.symbolRoot && state.symbolRoot !== snapshotRoot) {
      state.domSeries = [];
      state.signals = [];
    }
    state.symbolRoot = snapshotRoot;
  }
  if (!state.hasInitialSnapshot) {
    state.domSeries = [];
    state.signals = [];
    state.hasInitialSnapshot = true;
  }
  const { bids, asks, timestamp } = aggregateDepth(snapshot);
  const total = bids + asks;

  if (total === 0 && state.domSeries.length === 0) {
    return;
  }

  const imbalanceRatio = total > 0 ? (bids - asks) / total : 0;
  const previous = state.domSeries[state.domSeries.length - 1];
  if (previous && timestamp <= previous.timestamp) {
    return;
  }
  const momentum = previous ? imbalanceRatio - previous.imbalanceRatio : 0;
  const nextPoint: DomTrendPoint = {
    timestamp,
    imbalanceRatio,
    momentum
  };

  state.domSeries.push(nextPoint);
  if (state.domSeries.length > DOM_SERIES_LIMIT) {
    state.domSeries.shift();
  }

  const strength = Math.abs(imbalanceRatio);
  const momentumAbs = Math.abs(momentum);
  if (strength > 0.12 && momentumAbs > 0.04) {
    const type: DomSignal['type'] = momentum >= 0 ? 'buy' : 'sell';
    const lastSignal = state.signals[state.signals.length - 1];
    if (!lastSignal || lastSignal.type !== type || timestamp - lastSignal.timestamp > 15000) {
      state.signals.push({
        id: `${timestamp}-${type}`,
        timestamp,
        type,
        strength,
        momentum: momentumAbs,
        text: formatSignalText(type)
      });
      if (state.signals.length > DOM_SIGNAL_LIMIT) {
        state.signals.shift();
      }
    }
  }
};

const monitorSlice = createSlice({
  name: 'monitor',
  initialState,
  reducers: {
    setMonitorActive(state, action: PayloadAction<boolean>) {
      state.active = action.payload;
      state.domSeries = [];
      state.signals = [];
      state.hasInitialSnapshot = false;
      state.symbolRoot = null;
    },
    setMonitorDuration(state, action: PayloadAction<string>) {
      state.duration = action.payload;
    },
    resetMonitorState(state) {
      state.domSeries = [];
      state.signals = [];
      state.hasInitialSnapshot = false;
      state.symbolRoot = null;
    }
  },
  extraReducers: (builder) => {
    builder
      .addCase(initializeDashboard.fulfilled, (state, action) => {
        state.domSeries = [];
        state.signals = [];
        state.hasInitialSnapshot = false;
        state.symbolRoot = extractRootSymbol(
          action.payload.snapshot.depth?.symbol ?? action.payload.snapshot.selectedSymbol ?? null
        );
        ingestSnapshot(state, action.payload.snapshot.depth);
      })
      .addCase(setSelectedSymbol, (state, action) => {
        state.domSeries = [];
        state.signals = [];
        state.hasInitialSnapshot = false;
        state.symbolRoot = extractRootSymbol(action.payload);
      })
      .addCase(setSelectedTimeframe, (state) => {
        state.domSeries = [];
        state.signals = [];
        state.hasInitialSnapshot = false;
      })
      .addCase(setMarketSubscriptionReady, (state, action) => {
        const extractedRoot = extractRootSymbol(action.payload.symbol ?? null);
        const nextRoot = extractedRoot && extractedRoot.length > 0 ? extractedRoot : null;
        const previousRoot = state.symbolRoot;
        const rootChanged = Boolean(nextRoot && previousRoot && nextRoot !== previousRoot);
        const hasDomData = state.hasInitialSnapshot || state.domSeries.length > 0 || state.signals.length > 0;
        const shouldReset = rootChanged || !hasDomData;

        if (shouldReset) {
          state.domSeries = [];
          state.signals = [];
          state.hasInitialSnapshot = false;
        }

        if (nextRoot) {
          state.symbolRoot = nextRoot;
        } else if (!state.symbolRoot) {
          state.symbolRoot = nextRoot;
        }
      })
      .addCase(updateDepthSnapshot, (state, action) => {
        const snapshotRoot = extractRootSymbol(action.payload?.symbol ?? null);
        if (snapshotRoot && state.symbolRoot && snapshotRoot !== state.symbolRoot) {
          state.domSeries = [];
          state.signals = [];
          state.hasInitialSnapshot = false;
        }
        ingestSnapshot(state, action.payload);
      });
  }
});

export const { setMonitorActive, setMonitorDuration, resetMonitorState } = monitorSlice.actions;

export default monitorSlice.reducer;
