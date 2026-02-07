import { useMemo, useRef, useState, useCallback, useEffect } from 'react';
import { useTranslation } from '@i18n';
import type { PointerEvent as ReactPointerEvent, WheelEvent } from 'react';
import type { MarketBar, TradeMarker } from '../types';
import { DEFAULT_MARKET_TIMEZONE, formatWithTimezone } from '../../../utils/timezone.js';
import styles from './ChartArea.module.css';

export interface PriceOverlay {
  id: string;
  price: number;
  label: string;
  color: string;
  dashed?: boolean;
  draggable?: boolean;
  onDrag?: (price: number) => void;
}

interface CandlestickChartProps {
  bars: MarketBar[];
  height?: number;
  overlays?: PriceOverlay[];
  tradeMarkers?: TradeMarker[];
  intervalSeconds?: number | null;
}

const CHART_TIMEZONE = DEFAULT_MARKET_TIMEZONE;

const mapRange = (value: number, minValue: number, maxValue: number, size: number): number => {
  if (minValue === maxValue) {
    return size / 2;
  }
  return ((maxValue - value) / (maxValue - minValue)) * size; // 恢复原始的Y轴映射逻辑
};

const clamp = (value: number, min: number, max: number): number => {
  return Math.max(min, Math.min(max, value));
};

const parseTimestampMs = (value: string | number | Date | null | undefined): number | null => {
  if (!value && value !== 0) {
    return null;
  }
  const ms = new Date(value).getTime();
  return Number.isNaN(ms) ? null : ms;
};

const normalizeTradeSide = (side?: string | null): 'buy' | 'sell' | null => {
  const normalized = typeof side === 'string' ? side.toLowerCase() : null;
  return normalized === 'buy' || normalized === 'sell' ? normalized : null;
};

// 格式化时间显示（根据当前语言的 locale）
const formatTime = (timestamp: string | number, locale: string): string => {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return '--:--';
  }

  const now = new Date();
  const diffDays = Math.abs(now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24);

  const formatted = diffDays >= 1
    ? formatWithTimezone(
        date,
        {
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit'
        },
        locale,
        CHART_TIMEZONE
      )
    : formatWithTimezone(
        date,
        {
          hour: '2-digit',
          minute: '2-digit'
        },
        locale,
        CHART_TIMEZONE
      );

  return formatted ?? '--:--';
};

// 生成价格刻度
const generatePriceTicks = (minPrice: number, maxPrice: number, tickCount: number = 8): number[] => {
  const range = maxPrice - minPrice;
  const step = range / (tickCount - 1);
  const ticks: number[] = [];
  
  for (let i = 0; i < tickCount; i++) {
    ticks.push(minPrice + step * i);
  }
  
  return ticks;
};

const PRICE_AREA_PADDING = 12;
const SKELETON_COLUMN_COUNT = 8;
const DEFAULT_CANDLE_WIDTH = 12;
const MIN_CANDLE_WIDTH = 4;
const MAX_CANDLE_WIDTH = 40;
const DEFAULT_VISIBLE_BARS = 120;
const Y_AXIS_WIDTH = 80; // Y轴区域宽度
const X_AXIS_HEIGHT = 30; // X轴区域高度
const APPROX_LABEL_WIDTH = 60;
const PRICE_RANGE_PADDING_RATIO = 0.08;

interface HoverState {
  index: number;
  clientX: number;
  clientY: number;
}

function CandlestickChart({
  bars,
  height = 400,
  overlays = [],
  tradeMarkers = [],
  intervalSeconds = null
}: CandlestickChartProps) { // 恢复合理的默认高度
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const { t, i18n } = useTranslation();

  const resolveLocale = (lang: string): string => {
    // 规范化语言到常用的 BCP-47 locale
    if (!lang) return 'en-US';
    const lower = lang.toLowerCase();
    if (lower.startsWith('zh')) return 'zh-CN';
    if (lower.startsWith('en')) return 'en-US';
    return lang;
  };
  const currentLocale = resolveLocale(i18n.language);

  // 状态管理
  const [candleWidth, setCandleWidth] = useState(DEFAULT_CANDLE_WIDTH);
  const [scrollOffset, setScrollOffset] = useState(0);
  const [visibleBars, setVisibleBars] = useState(DEFAULT_VISIBLE_BARS);
  const [isDragging, setIsDragging] = useState(false);
  const [lastPointerX, setLastPointerX] = useState(0);
  const [hoverState, setHoverState] = useState<HoverState | null>(null);

  const data = useMemo(() => bars || [], [bars]);

  const resolvedIntervalMs = useMemo(() => {
    if (intervalSeconds != null && Number.isFinite(intervalSeconds)) {
      return intervalSeconds * 1000;
    }

    const timestamps = data
      .map((bar) => parseTimestampMs(bar.timestamp))
      .filter((value): value is number => value !== null)
      .sort((a, b) => a - b);

    const deltas: number[] = [];

    for (let i = 1; i < timestamps.length; i++) {
      const delta = timestamps[i] - timestamps[i - 1];
      if (delta > 0) {
        deltas.push(delta);
      }
    }

    if (!deltas.length) {
      return null;
    }

    deltas.sort((a, b) => a - b);
    const middle = Math.floor(deltas.length / 2);

    const medianDelta =
      deltas.length % 2 === 0
        ? (deltas[middle - 1] + deltas[middle]) / 2
        : deltas[middle];

    return medianDelta;
  }, [data, intervalSeconds]);

  const deriveMarkerPrice = useCallback((bar: MarketBar, side: 'buy' | 'sell', markerPrice?: number | null) => {
    const explicitPrice = typeof markerPrice === 'number' && Number.isFinite(markerPrice)
      ? markerPrice
      : null;

    if (explicitPrice !== null) {
      return explicitPrice;
    }

    const open = bar.open ?? bar.close ?? null;
    const close = bar.close ?? bar.open ?? null;
    const high = bar.high ?? (open !== null && close !== null ? Math.max(open, close) : null);
    const low = bar.low ?? (open !== null && close !== null ? Math.min(open, close) : null);

    const fallback = side === 'buy'
      ? low ?? open ?? close
      : high ?? open ?? close;

    return typeof fallback === 'number' && Number.isFinite(fallback) ? fallback : null;
  }, []);

  // 计算可见数据范围
  const { visibleData, maxScrollOffset } = useMemo(() => {
    if (data.length === 0) {
      return { visibleData: [], maxScrollOffset: 0 };
    }

    const maxOffset = Math.max(0, data.length - visibleBars);
    const clampedOffset = clamp(scrollOffset, 0, maxOffset);
    const startIndex = Math.max(0, data.length - visibleBars - clampedOffset);
    const endIndex = Math.min(data.length, startIndex + visibleBars);
    
    return {
      visibleData: data.slice(startIndex, endIndex),
      maxScrollOffset: maxOffset
    };
  }, [data, visibleBars, scrollOffset]);

  const visibleTradeMarkers = useMemo(() => {
    if (!tradeMarkers?.length || !visibleData.length) {
      return [] as Array<{ id: string; barIndex: number; price: number; side: 'buy' | 'sell' }>;
    }

    const visibleBarsWithTimestamp = visibleData.map((bar, index) => ({
      bar,
      index,
      timestampMs: parseTimestampMs(bar.timestamp)
    }));

    const findBarIndexForTimestamp = (targetTimestamp: number): number | null => {
      let fallbackIndex: number | null = null;
      let smallestDelta = Number.POSITIVE_INFINITY;

      for (let i = 0; i < visibleBarsWithTimestamp.length; i++) {
        const entry = visibleBarsWithTimestamp[i];
        if (entry.timestampMs === null) {
          continue;
        }

        const previousTs = visibleBarsWithTimestamp[i - 1]?.timestampMs ?? null;
        const nextTs = visibleBarsWithTimestamp[i + 1]?.timestampMs ?? null;

        let start = entry.timestampMs;
        let end = entry.timestampMs;

        if (typeof resolvedIntervalMs === 'number' && Number.isFinite(resolvedIntervalMs)) {
          start = entry.timestampMs;
          end = entry.timestampMs + resolvedIntervalMs;
        } else {
          const inferredStart =
            previousTs !== null ? entry.timestampMs - (entry.timestampMs - previousTs) / 2 : entry.timestampMs;
          const inferredEnd = nextTs !== null ? entry.timestampMs + (nextTs - entry.timestampMs) / 2 : entry.timestampMs;
          start = inferredStart;
          end = inferredEnd;
        }

        if (targetTimestamp >= start && targetTimestamp < end) {
          return entry.index;
        }

        const delta = Math.abs(targetTimestamp - entry.timestampMs);
        if (delta < smallestDelta) {
          smallestDelta = delta;
          fallbackIndex = entry.index;
        }
      }

      return fallbackIndex;
    };

    return tradeMarkers
      .map((marker, markerIndex) => {
        const side = normalizeTradeSide(marker.side);
        if (!side) {
          return null;
        }

        const markerTimestamp = parseTimestampMs(marker.timestamp);
        if (markerTimestamp === null) {
          return null;
        }

        const barIndex = findBarIndexForTimestamp(markerTimestamp);
        if (barIndex == null || barIndex < 0) {
          return null;
        }

        const bar = visibleData[barIndex];
        const price = deriveMarkerPrice(bar, side, marker.price);

        if (price === null) {
          return null;
        }

        return {
          id: marker.id ?? `${markerTimestamp}-${markerIndex}`,
          barIndex,
          price,
          side
        };
      })
      .filter(
        (
          entry
        ): entry is { id: string; barIndex: number; price: number; side: 'buy' | 'sell' } => Boolean(entry)
      )
      .sort((a, b) => a.barIndex - b.barIndex);
  }, [deriveMarkerPrice, resolvedIntervalMs, tradeMarkers, visibleData]);

  const updateVisibleBars = useCallback(() => {
    if (!containerRef.current) {
      return;
    }
    const containerWidth = Math.max(0, containerRef.current.clientWidth - Y_AXIS_WIDTH);
    const gap = 2;
    const calculatedBars = Math.floor(containerWidth / Math.max(1, candleWidth + gap));
    const newVisibleBars = Math.max(40, Math.min(480, calculatedBars || DEFAULT_VISIBLE_BARS));
    setVisibleBars((previous) => (previous === newVisibleBars ? previous : newVisibleBars));
  }, [candleWidth]);

  // 自动调整可见bar数量基于容器宽度
  useEffect(() => {
    updateVisibleBars();

    if (typeof ResizeObserver === 'function' && containerRef.current) {
      const observer = new ResizeObserver(() => updateVisibleBars());
      observer.observe(containerRef.current);
      return () => observer.disconnect();
    }

    window.addEventListener('resize', updateVisibleBars);
    return () => window.removeEventListener('resize', updateVisibleBars);
  }, [updateVisibleBars]);

  // 滚轮缩放和滚动处理
  const handleWheel = useCallback((event: WheelEvent) => {
    event.preventDefault();
    
    if (event.ctrlKey || event.metaKey) {
      // 缩放功能
      const zoomFactor = event.deltaY > 0 ? 0.9 : 1.1;
      const newWidth = clamp(candleWidth * zoomFactor, MIN_CANDLE_WIDTH, MAX_CANDLE_WIDTH);
      setCandleWidth(newWidth);
    } else {
      // 滚动功能
      const scrollSpeed = 3;
      const deltaScroll = event.deltaY > 0 ? scrollSpeed : -scrollSpeed;
      setScrollOffset(prev => clamp(prev + deltaScroll, 0, maxScrollOffset));
    }
  }, [candleWidth, maxScrollOffset]);

  // 拖拽滚动处理
  const handlePointerDown = useCallback((event: ReactPointerEvent) => {
    if (event.button === 0) { // 左键
      setIsDragging(true);
      setLastPointerX(event.clientX);
      setHoverState(null);
      event.preventDefault();
    }
  }, []);

  const handlePointerMove = useCallback((event: PointerEvent) => {
    if (isDragging) {
      const deltaX = event.clientX - lastPointerX;
      const scrollSpeed = 0.5;
      const deltaScroll = -deltaX * scrollSpeed;
      setScrollOffset(prev => clamp(prev + deltaScroll, 0, maxScrollOffset));
      setLastPointerX(event.clientX);
    }
  }, [isDragging, lastPointerX, maxScrollOffset]);

  const handlePointerUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  const clearHoverState = useCallback(() => {
    setHoverState(null);
  }, []);

  const handleHover = useCallback((event: ReactPointerEvent, index: number) => {
    if (isDragging) {
      return;
    }
    const container = containerRef.current;
    if (!container) {
      return;
    }
    const rect = container.getBoundingClientRect();
    setHoverState({
      index,
      clientX: event.clientX - rect.left,
      clientY: event.clientY - rect.top
    });
  }, [isDragging]);

  useEffect(() => {
    if (isDragging) {
      window.addEventListener('pointermove', handlePointerMove);
      window.addEventListener('pointerup', handlePointerUp);
      return () => {
        window.removeEventListener('pointermove', handlePointerMove);
        window.removeEventListener('pointerup', handlePointerUp);
      };
    }
  }, [isDragging, handlePointerMove, handlePointerUp]);

  if (data.length === 0) {
    return (
      <div className={styles.loadingState} role="status" aria-live="polite" aria-busy="false">
        <p>{t('dashboard.kline.chart.no_data')}</p>
      </div>
    );
  }

  if (data.length < 2) {
    const placeholderCount = Math.max(4, Math.min(SKELETON_COLUMN_COUNT, data.length + 3));
    return (
      <div className={styles.loadingState} role="status" aria-live="polite" aria-busy="true">
        <p>{t('dashboard.kline.chart.wait_first_tick')}</p>
        <div className={styles.loadingSkeleton} aria-hidden="true">
          {Array.from({ length: placeholderCount }).map((_, index) => (
            <span key={index} />
          ))}
        </div>
      </div>
    );
  }

  const priceHeight = height * 0.7 - X_AXIS_HEIGHT; // 调整价格区域高度
  const volumeHeight = height * 0.3;
  const gap = 2;
  const chartWidth = visibleData.length * (candleWidth + gap) + gap + Y_AXIS_WIDTH;
  
  const prices = visibleData
    .flatMap((bar) => [bar.high ?? null, bar.low ?? null])
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  const overlayPrices = overlays
    .map((overlay) => overlay.price)
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  const tradeMarkerPrices = visibleTradeMarkers
    .map((marker) => marker.price)
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  const combined = [...prices, ...overlayPrices, ...tradeMarkerPrices];
  const maxPrice = combined.length ? Math.max(...combined) : Math.max(...prices);
  const minPrice = combined.length ? Math.min(...combined) : Math.min(...prices);
  const maxVolume = Math.max(...visibleData.map((bar) => bar.volume ?? 0));

  const effectiveMax = maxPrice === minPrice ? maxPrice + 1 : maxPrice;
  const effectiveMin = maxPrice === minPrice ? minPrice - 1 : minPrice;

  const range = effectiveMax - effectiveMin || effectiveMax || 1;
  const paddedMax = effectiveMax + range * PRICE_RANGE_PADDING_RATIO;
  const paddedMin = effectiveMin - range * (PRICE_RANGE_PADDING_RATIO / 2);

  // 生成价格刻度
  const priceTicks = generatePriceTicks(paddedMin, paddedMax, 8);

  const yForPrice = (value: number) => mapRange(value, paddedMin, paddedMax, priceHeight) + PRICE_AREA_PADDING;
  const priceForY = (value: number) => {
    const ratio = clamp(value - PRICE_AREA_PADDING, 0, priceHeight) / priceHeight;
    return paddedMax - (paddedMax - paddedMin) * ratio;
  };

  const handleOverlayPointerDown = (overlay: PriceOverlay) => (event: ReactPointerEvent<SVGLineElement | SVGCircleElement>) => {
    if (!overlay.draggable || !overlay.onDrag) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const svg = svgRef.current;
    if (!svg) {
      return;
    }

    const updateFromClientY = (clientY: number) => {
      const rect = svg.getBoundingClientRect();
      const relativeY = clientY - rect.top - PRICE_AREA_PADDING;
      const nextPrice = priceForY(relativeY);
      overlay.onDrag?.(nextPrice);
    };

    updateFromClientY(event.clientY);

    const handleMove = (moveEvent: PointerEvent) => {
      moveEvent.preventDefault();
      updateFromClientY(moveEvent.clientY);
    };

    const handleUp = () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
    };

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
  };

  const labelCount = Math.max(1, Math.floor((chartWidth - Y_AXIS_WIDTH) / APPROX_LABEL_WIDTH));
  const labelInterval = Math.max(1, Math.ceil(visibleData.length / labelCount));

  const hoveredBar = hoverState ? visibleData[hoverState.index] : null;
  const tooltipDate = hoveredBar?.timestamp ? new Date(hoveredBar.timestamp) : null;

  return (
    <div
      ref={containerRef}
      style={{
        width: '100%',
        height: `${height}px`,
        overflow: 'hidden',
        cursor: isDragging ? 'grabbing' : 'grab',
        userSelect: 'none',
        position: 'relative'
      }}
      onWheel={handleWheel}
      onPointerDown={handlePointerDown}
      onPointerLeave={clearHoverState}
    >
      <svg
        ref={svgRef}
        width="100%"
        height="100%"
        viewBox={`0 0 ${chartWidth} ${height}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={t('dashboard.kline.chart.aria_label')}
        style={{ display: 'block' }}
      >
        {/* 价格区域背景 */}
        <rect
          x={Y_AXIS_WIDTH}
          y={0}
          width={chartWidth - Y_AXIS_WIDTH}
          height={priceHeight + PRICE_AREA_PADDING * 2}
          fill="rgba(248, 250, 252, 0.5)"
          stroke="rgba(148, 163, 184, 0.2)"
        />
        
        {/* 成交量区域背景 */}
        <rect
          x={Y_AXIS_WIDTH}
          y={priceHeight + PRICE_AREA_PADDING * 2 + 10}
          width={chartWidth - Y_AXIS_WIDTH}
          height={volumeHeight}
          fill="rgba(241, 245, 249, 0.5)"
          stroke="rgba(148, 163, 184, 0.2)"
        />

        {/* Y轴价格刻度 */}
        {priceTicks.map((price, index) => {
          const y = yForPrice(price);
          return (
            <g key={index}>
              <line
                x1={Y_AXIS_WIDTH - 5}
                x2={Y_AXIS_WIDTH}
                y1={y}
                y2={y}
                stroke="rgba(148, 163, 184, 0.6)"
                strokeWidth={1}
              />
              <line
                x1={Y_AXIS_WIDTH}
                x2={chartWidth}
                y1={y}
                y2={y}
                stroke="rgba(148, 163, 184, 0.1)"
                strokeWidth={1}
              />
              <text
                x={Y_AXIS_WIDTH - 8}
                y={y + 4}
                textAnchor="end"
                fontSize={10}
                fill="rgba(71, 85, 105, 0.8)"
                fontFamily="monospace"
              >
                {price.toFixed(2)}
              </text>
            </g>
          );
        })}

        {/* X轴时间刻度 */}
        {visibleData.map((bar, index) => {
          if (index % labelInterval !== 0) return null;
          const x = Y_AXIS_WIDTH + index * (candleWidth + gap) + gap + candleWidth / 2;
          const timeY = height - 5;
          return (
            <g key={`time-${index}`}>
              <line
                x1={x}
                x2={x}
                y1={priceHeight + PRICE_AREA_PADDING * 2}
                y2={priceHeight + PRICE_AREA_PADDING * 2 + 5}
                stroke="rgba(148, 163, 184, 0.6)"
                strokeWidth={1}
              />
              <text
                x={x}
                y={timeY}
                textAnchor="middle"
                fontSize={10}
                fill="rgba(71, 85, 105, 0.8)"
                fontFamily="monospace"
              >
                {formatTime(bar.timestamp, currentLocale)}
              </text>
            </g>
          );
        })}

        {/* K线数据 */}
        {visibleData.map((bar, index) => {
          const x = Y_AXIS_WIDTH + index * (candleWidth + gap) + gap;
          const open = bar.open ?? bar.close ?? 0;
          const close = bar.close ?? bar.open ?? 0;
          const high = bar.high ?? Math.max(open, close);
          const low = bar.low ?? Math.min(open, close);
          const yHigh = mapRange(high, effectiveMin, effectiveMax, priceHeight);
          const yLow = mapRange(low, effectiveMin, effectiveMax, priceHeight);
          const yOpen = mapRange(open, effectiveMin, effectiveMax, priceHeight);
          const yClose = mapRange(close, effectiveMin, effectiveMax, priceHeight);
          const positive = close >= open;
          const volume = bar.volume ?? 0;
          const volumeHeightScaled = maxVolume > 0 ? (volume / maxVolume) * (volumeHeight - 12) : 0;
          const volumeY = priceHeight + PRICE_AREA_PADDING * 2 + 20 + (volumeHeight - volumeHeightScaled - 12);

          return (
            <g
              key={bar.timestamp ?? index}
              onPointerMove={(event) => handleHover(event, index)}
              onPointerLeave={clearHoverState}
            >
              {/* 价格线 */}
              <line
                x1={x + candleWidth / 2}
                x2={x + candleWidth / 2}
                y1={yHigh + PRICE_AREA_PADDING}
                y2={yLow + PRICE_AREA_PADDING}
                stroke={positive ? '#4ade80' : '#f87171'}
                strokeWidth={1.2}
              />
              {/* 价格矩形 */}
              <rect
                x={x}
                y={Math.min(yOpen, yClose) + PRICE_AREA_PADDING}
                width={candleWidth}
                height={Math.max(Math.abs(yClose - yOpen), 2)}
                fill={positive ? 'rgba(74, 222, 128, 0.8)' : 'rgba(248, 113, 113, 0.8)'}
                stroke={positive ? '#16a34a' : '#dc2626'}
                strokeWidth={0.8}
                rx={1.6}
              />
              {/* 成交量柱 */}
              <rect
                x={x}
                y={volumeY}
                width={candleWidth}
                height={Math.max(volumeHeightScaled, 1.5)}
                fill={positive ? 'rgba(59, 130, 246, 0.45)' : 'rgba(236, 72, 153, 0.4)'}
              />
            </g>
          );
        })}

        {/* 交易标记 */}
        {visibleTradeMarkers.map((marker) => {
          const x = Y_AXIS_WIDTH + marker.barIndex * (candleWidth + gap) + gap + candleWidth / 2;
          const y = yForPrice(marker.price);
          const size = clamp(candleWidth * 0.6, 5, 12);
          const isBuy = marker.side === 'buy';
          const points = isBuy
            ? `${x},${y - size} ${x - size},${y + size * 0.85} ${x + size},${y + size * 0.85}`
            : `${x},${y + size} ${x - size},${y - size * 0.85} ${x + size},${y - size * 0.85}`;

          return (
            <polygon
              key={marker.id}
              points={points}
              fill={isBuy ? '#16a34a' : '#dc2626'}
              stroke={isBuy ? '#064e3b' : '#7f1d1d'}
              strokeWidth={0.8}
              className={styles.tradeMarker}
            />
          );
        })}

        {/* 价格和成交量区域分隔线 */}
        <line
          x1={Y_AXIS_WIDTH}
          x2={chartWidth}
          y1={priceHeight + PRICE_AREA_PADDING * 2 + 10}
          y2={priceHeight + PRICE_AREA_PADDING * 2 + 10}
          stroke="rgba(148, 163, 184, 0.4)"
          strokeWidth={1}
        />

        {/* 覆盖层（水平线等） */}
        {(() => {
          const overlayEntries = overlays
            .filter((overlay) => Number.isFinite(overlay.price))
            .map((overlay) => {
              const y = yForPrice(overlay.price);
              return {
                overlay,
                y,
                labelLength: overlay.label?.length ?? 0
              };
            });

          const sortedByY = overlayEntries.slice().sort((a, b) => a.y - b.y);
          const MIN_VERTICAL_GAP = 18;
          const LONG_LABEL_THRESHOLD = 12;
          let lastY: number | null = null;
          let lastPlacement: 'above' | 'below' = 'below';
          const placementMap = new Map<string, { y: number; placement: 'above' | 'below' }>();

          for (const entry of sortedByY) {
            const isCluster = lastY !== null && Math.abs(entry.y - lastY) < MIN_VERTICAL_GAP;
            const shouldAlternate = isCluster || entry.labelLength >= LONG_LABEL_THRESHOLD;
            const placement: 'above' | 'below' = shouldAlternate
              ? lastPlacement === 'above'
                ? 'below'
                : 'above'
              : 'above';

            placementMap.set(entry.overlay.id, { y: entry.y, placement });
            lastY = entry.y;
            lastPlacement = placement;
          }

          return overlayEntries.map(({ overlay }) => {
            const layout = placementMap.get(overlay.id);
            if (!layout) {
              return null;
            }
            const textY = layout.placement === 'above' ? layout.y - 6 : layout.y + 14;
            const textX = Y_AXIS_WIDTH + 8;
            return (
              <g key={overlay.id}>
                <line
                  x1={Y_AXIS_WIDTH}
                  x2={chartWidth}
                  y1={layout.y}
                  y2={layout.y}
                  stroke={overlay.color}
                  strokeWidth={1.6}
                  strokeDasharray={overlay.dashed ? '6 6' : undefined}
                  opacity={overlay.dashed ? 0.85 : 1}
                  cursor={overlay.draggable ? 'ns-resize' : 'default'}
                  onPointerDown={handleOverlayPointerDown(overlay)}
                />
                <text
                  x={textX}
                  y={textY}
                  textAnchor="start"
                  fontSize={11}
                  fill={overlay.color}
                  fontWeight={600}
                  dominantBaseline={layout.placement === 'above' ? 'alphabetic' : 'hanging'}
                >
                  {overlay.label}
                </text>
                {overlay.draggable ? (
                  <circle
                    cx={chartWidth - 12}
                    cy={layout.y}
                    r={5.5}
                    fill={overlay.color}
                    opacity={0.85}
                    onPointerDown={handleOverlayPointerDown(overlay)}
                  />
                ) : null}
              </g>
            );
          });
        })()}

        {/* Y轴标签 */}
        <text
          x={15}
          y={priceHeight / 2}
          textAnchor="middle"
          fontSize={12}
          fill="rgba(71, 85, 105, 0.7)"
          fontWeight={600}
          transform={`rotate(-90, 15, ${priceHeight / 2})`}
        >
          {t('dashboard.kline.chart.y_axis_price')}
        </text>
        
        <text
          x={15}
          y={priceHeight + PRICE_AREA_PADDING * 2 + 30 + volumeHeight / 2}
          textAnchor="middle"
          fontSize={12}
          fill="rgba(71, 85, 105, 0.7)"
          fontWeight={600}
          transform={`rotate(-90, 15, ${priceHeight + PRICE_AREA_PADDING * 2 + 30 + volumeHeight / 2})`}
        >
          {t('dashboard.kline.chart.y_axis_volume')}
        </text>
      </svg>
      
      {hoveredBar && hoverState ? (
        <div
          style={{
            position: 'absolute',
            left: Math.min(
              Math.max(hoverState.clientX + 12, 8),
              Math.max(8, (containerRef.current?.clientWidth ?? 0) - 180)
            ),
            top: Math.max(hoverState.clientY - 110, 8),
            background: 'rgba(15, 23, 42, 0.88)',
            color: '#f8fafc',
            padding: '10px 12px',
            borderRadius: '8px',
            fontSize: '12px',
            fontFamily: 'monospace',
            lineHeight: 1.6,
            pointerEvents: 'none',
            boxShadow: '0 8px 20px rgba(15, 23, 42, 0.35)'
          }}
        >
          <div>
            {t('dashboard.kline.chart.tooltip.time')}
            {tooltipDate
              ? (
                  formatWithTimezone(
                    tooltipDate,
                    {
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit'
                    },
                    currentLocale,
                    CHART_TIMEZONE
                  ) ?? '--:--:--'
                )
              : '--:--:--'}
          </div>
          <div>{t('dashboard.kline.chart.tooltip.open')}{(hoveredBar.open ?? 0).toFixed(2)}</div>
          <div>{t('dashboard.kline.chart.tooltip.high')}{(hoveredBar.high ?? hoveredBar.open ?? 0).toFixed(2)}</div>
          <div>{t('dashboard.kline.chart.tooltip.low')}{(hoveredBar.low ?? hoveredBar.open ?? 0).toFixed(2)}</div>
          <div>{t('dashboard.kline.chart.tooltip.close')}{(hoveredBar.close ?? hoveredBar.open ?? 0).toFixed(2)}</div>
          <div>{t('dashboard.kline.chart.tooltip.volume')}{(hoveredBar.volume ?? 0).toLocaleString(currentLocale)}</div>
        </div>
      ) : null}
    </div>
  );
}

export default CandlestickChart;
