import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import type { AccountSummary, MarketTickerSnapshot, PositionItem } from '@features/dashboard/types';
import { extractRootSymbol, normalizePriceByTick, getTickValue } from '@features/dashboard/utils/priceFormatting';
import { initializeDashboard } from '@store/thunks/initializeDashboard';
import { setTickerSnapshot } from '@store/slices/marketSlice';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const normalizeSymbol = (value: string) => value.trim().toUpperCase();

const computeFloatingPnl = (position: PositionItem, rawMarkPrice: number) => {
  const absQuantity = Math.abs(position.quantity ?? 0);
  if (!absQuantity) {
    return 0;
  }
  const directionSign = position.direction === 'short' ? -1 : 1;
  const markPrice =
    normalizePriceByTick(rawMarkPrice, position.symbol, {
      // 仅按 tickSize 对齐，不进行基于参考价格的尺度变化，避免 PnL 误差
      allowDownscale: false
    }) ?? rawMarkPrice;
  const multiplier = position.multiplier ?? getTickValue(position.symbol) ?? 1;
  const raw = (markPrice - position.avgPrice) * absQuantity * multiplier * directionSign;
  return Number(raw.toFixed(2));
};

const pickFirstFinite = (...values: Array<number | null | undefined>): number | null => {
  for (const value of values) {
    if (isFiniteNumber(value)) {
      return value;
    }
  }
  return null;
};

const deriveTickerPrice = (ticker: MarketTickerSnapshot): number | null => {
  const bidAskMid =
    isFiniteNumber(ticker.bid) && isFiniteNumber(ticker.ask)
      ? Number(((ticker.bid + ticker.ask) / 2).toFixed(4))
      : null;
  // 优先使用中间价，减少成交价跳动导致的 PnL 抖动
  return pickFirstFinite(ticker.midPrice, bidAskMid, ticker.last, ticker.close, ticker.bid, ticker.ask);
};

type RequestStatus = 'idle' | 'loading' | 'succeeded' | 'failed';

interface AccountState {
  summary: AccountSummary | null;
  positions: PositionItem[];
  status: RequestStatus;
  error?: string;
  serviceWarning: string | null;
}

const initialState: AccountState = {
  summary: null,
  positions: [],
  status: 'idle',
  serviceWarning: null
};

const accountSlice = createSlice({
  name: 'account',
  initialState,
  reducers: {
    setAccountSummary(state, action: PayloadAction<AccountSummary>) {
      state.summary = action.payload;
    },
    setPositions(state, action: PayloadAction<PositionItem[]>) {
      state.positions = action.payload;
    },
    setAccountServiceWarning(state, action: PayloadAction<string | null | undefined>) {
      state.serviceWarning = action.payload ?? null;
    },
    updateAccountSummary(state, action: PayloadAction<Partial<AccountSummary>>) {
      if (!state.summary) {
        return;
      }
      state.summary = { ...state.summary, ...action.payload };
    },
    upsertPosition(state, action: PayloadAction<PositionItem>) {
      const index = state.positions.findIndex((position) => position.id === action.payload.id);
      if (index === -1) {
        state.positions.push(action.payload);
        return;
      }
      state.positions[index] = action.payload;
    },
    updatePositionPricing(state, action: PayloadAction<{ symbol: string; price?: number | null }>) {
      const { symbol, price } = action.payload;
      if (!symbol) {
        return;
      }
      if (!isFiniteNumber(price)) {
        return;
      }
      const normalized = normalizeSymbol(symbol);
      const normalizedRoot = extractRootSymbol(normalized);
      for (const position of state.positions) {
        const positionSymbol = normalizeSymbol(position.symbol);
        if (positionSymbol === normalized) {
          position.markPrice = price;
          position.pnl = computeFloatingPnl(position, price);
          continue;
        }
        if (!normalizedRoot) {
          continue;
        }
        const positionRoot = extractRootSymbol(positionSymbol);
        if (positionRoot && positionRoot === normalizedRoot) {
          position.markPrice = price;
          position.pnl = computeFloatingPnl(position, price);
        }
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
        state.status = 'succeeded';
        state.summary = action.payload.snapshot.account;
        state.positions = action.payload.snapshot.positions;
        state.serviceWarning = action.payload.snapshot.accountWarning ?? null;
      })
      .addCase(initializeDashboard.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.error.message;
      })
      .addCase(setTickerSnapshot, (state, action) => {
        const snapshot = action.payload;
        if (!snapshot || !snapshot.symbol) {
          return;
        }
        const price = deriveTickerPrice(snapshot);
        if (price === null) {
          return;
        }
        const normalized = normalizeSymbol(snapshot.symbol);
        const normalizedRoot = extractRootSymbol(normalized);
        for (const position of state.positions) {
          const positionSymbol = normalizeSymbol(position.symbol);
          if (positionSymbol === normalized) {
            position.markPrice = price;
            position.pnl = computeFloatingPnl(position, price);
            continue;
          }
          if (!normalizedRoot) {
            continue;
          }
          const positionRoot = extractRootSymbol(positionSymbol);
          if (positionRoot && positionRoot === normalizedRoot) {
            position.markPrice = price;
            position.pnl = computeFloatingPnl(position, price);
          }
        }
      });
  }
});

export const {
  setAccountSummary,
  setPositions,
  setAccountServiceWarning,
  updateAccountSummary,
  upsertPosition,
  updatePositionPricing
} = accountSlice.actions;

export default accountSlice.reducer;
