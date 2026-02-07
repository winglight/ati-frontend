export type UTCTimestamp = number;

export interface CandlestickData {
  time: UTCTimestamp;
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface LineData {
  time: UTCTimestamp;
  value: number;
}

export type SeriesMarker = {
  time: UTCTimestamp;
  position: 'aboveBar' | 'belowBar' | 'inBar';
  color?: string;
  shape?: 'circle' | 'square' | 'arrowUp' | 'arrowDown';
  text?: string;
};

export interface MouseEventParams {
  time?: UTCTimestamp | null;
}

export interface ISeriesApi<_TSeriesType extends string = string> {
  setData(data: unknown[]): void;
  setMarkers(markers: SeriesMarker[]): void;
}

interface TimeScaleApi {
  fitContent(): void;
  subscribeVisibleLogicalRangeChange(handler: (range: unknown) => void): void;
  unsubscribeVisibleLogicalRangeChange(handler: (range: unknown) => void): void;
}

export interface IChartApi {
  addCandlestickSeries(options?: Record<string, unknown>): ISeriesApi<'Candlestick'>;
  addAreaSeries(options?: Record<string, unknown>): ISeriesApi<'Area'>;
  remove(): void;
  applyOptions(options: Record<string, unknown>): void;
  timeScale(): TimeScaleApi;
  subscribeClick(handler: (param: MouseEventParams) => void): void;
  unsubscribeClick(handler: (param: MouseEventParams) => void): void;
}

const noop = () => {};

const createSeries = (): ISeriesApi => ({
  setData: noop,
  setMarkers: noop
});

const createTimeScale = (): TimeScaleApi => ({
  fitContent: noop,
  subscribeVisibleLogicalRangeChange: noop,
  unsubscribeVisibleLogicalRangeChange: noop
});

export const CrosshairMode = {
  Normal: 0,
  Magnet: 1
} as const;

export function createChart(_container: HTMLElement, _options?: Record<string, unknown>): IChartApi {
  return {
    addCandlestickSeries: () => createSeries(),
    addAreaSeries: () => createSeries(),
    remove: noop,
    applyOptions: noop,
    timeScale: createTimeScale,
    subscribeClick: noop,
    unsubscribeClick: noop
  };
}
