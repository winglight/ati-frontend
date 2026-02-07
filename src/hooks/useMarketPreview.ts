import { useEffect, useMemo, useRef } from 'react';
import type { MarketBar, MarketTickerSnapshot } from '@features/dashboard/types';
import { selectBestTickerPrice } from '@features/dashboard/components/MarketMonitorPanel';
import { useAppDispatch, useAppSelector } from '@store/hooks';
import { fetchMarketSnapshot } from '@store/thunks/fetchMarketSnapshot';

const PREVIEW_DURATION_SECONDS = 60 * 60 * 6; // 6 小时迷你行情范围

export type MarketPreviewDirection = 'up' | 'down' | 'flat';

export interface UseMarketPreviewResult {
  symbol: string | null;
  timeframe: string | null;
  bars: MarketBar[];
  currentPrice: number | null;
  change: number | null;
  changePercent: number | null;
  direction: MarketPreviewDirection;
  loading: boolean;
  error: string | null;
  ticker?: MarketTickerSnapshot | null;
}

export interface UseMarketPreviewOptions {
  timeframe?: string | null;
  durationSeconds?: number;
}

function useMarketPreview(
  symbol?: string | null,
  options?: UseMarketPreviewOptions
): UseMarketPreviewResult {
  const dispatch = useAppDispatch();
  const marketState = useAppSelector((state) => state.market);
  const {
    kline,
    ticker,
    status,
    error,
    timeframes,
    selectedSymbol,
    selectedTimeframe
  } = marketState;

  const { timeframe: timeframeOverride, durationSeconds = PREVIEW_DURATION_SECONDS } = options ?? {};

  const activeSymbol = symbol ?? selectedSymbol ?? null;
  const timeframe =
    timeframeOverride ?? selectedTimeframe ?? timeframes[0]?.value ?? kline?.timeframe ?? null;

  const normalizedTicker = useMemo(() => {
    if (!activeSymbol || !ticker || ticker.symbol !== activeSymbol) {
      return null;
    }
    return ticker;
  }, [activeSymbol, ticker]);

  const bars = useMemo(() => {
    if (!kline || !activeSymbol || !timeframe) {
      return [];
    }
    if (kline.symbol !== activeSymbol || kline.timeframe !== timeframe) {
      return [];
    }
    return kline.bars ?? [];
  }, [activeSymbol, kline, timeframe]);

  const shouldFetchSnapshot = useMemo(() => {
    if (!activeSymbol || !timeframe) {
      return false;
    }
    if (!kline) {
      return true;
    }
    if (kline.symbol !== activeSymbol || kline.timeframe !== timeframe) {
      return true;
    }
    if (!kline.bars || kline.bars.length === 0) {
      return true;
    }
    return false;
  }, [activeSymbol, kline, timeframe]);

  const requestKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!activeSymbol || !timeframe) {
      requestKeyRef.current = null;
      return;
    }
    if (!shouldFetchSnapshot) {
      requestKeyRef.current = null;
      return;
    }
    const key = `${activeSymbol}__${timeframe}`;
    if (requestKeyRef.current === key && (status === 'loading' || status === 'failed')) {
      return;
    }
    requestKeyRef.current = key;
    void dispatch(
      fetchMarketSnapshot({
        symbol: activeSymbol,
        timeframe,
        durationSeconds,
        refreshAvailability: false
      })
    );
  }, [activeSymbol, dispatch, durationSeconds, shouldFetchSnapshot, status, timeframe]);

  const fallbackClose = useMemo(() => {
    if (normalizedTicker?.close != null) {
      return normalizedTicker.close;
    }
    if (bars.length > 1) {
      return bars[bars.length - 2]?.close ?? null;
    }
    if (bars.length === 1) {
      return bars[0]?.close ?? null;
    }
    return null;
  }, [bars, normalizedTicker]);

  const currentPrice = useMemo(() => {
    if (normalizedTicker) {
      const price = selectBestTickerPrice(normalizedTicker);
      if (price != null) {
        return price;
      }
    }
    if (bars.length) {
      return bars[bars.length - 1]?.close ?? null;
    }
    return null;
  }, [bars, normalizedTicker]);

  const change = useMemo(() => {
    if (normalizedTicker?.change != null) {
      return normalizedTicker.change;
    }
    if (currentPrice != null && fallbackClose != null) {
      const delta = currentPrice - fallbackClose;
      if (Number.isFinite(delta)) {
        return delta;
      }
    }
    return null;
  }, [currentPrice, fallbackClose, normalizedTicker]);

  const changePercent = useMemo(() => {
    if (normalizedTicker?.changePercent != null) {
      return normalizedTicker.changePercent;
    }
    if (change != null && fallbackClose != null && fallbackClose !== 0) {
      const percent = (change / fallbackClose) * 100;
      if (Number.isFinite(percent)) {
        return percent;
      }
    }
    return null;
  }, [change, fallbackClose, normalizedTicker]);

  const direction: MarketPreviewDirection = useMemo(() => {
    if (change == null || change === 0) {
      return 'flat';
    }
    return change > 0 ? 'up' : 'down';
  }, [change]);

  const loading = status === 'loading' && (shouldFetchSnapshot || requestKeyRef.current !== null);
  const previewError = error ?? null;

  return {
    symbol: activeSymbol,
    timeframe,
    bars,
    currentPrice,
    change,
    changePercent,
    direction,
    loading,
    error: previewError,
    ticker: normalizedTicker
  };
}

export default useMarketPreview;
