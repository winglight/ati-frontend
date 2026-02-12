import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useState
} from 'react';
import { useAppDispatch, useAppSelector } from '@store/hooks';
import { addToast } from '@store/slices/toastSlice';
import {
  fetchScreenerResult,
  listScreenerResults,
  runScreenerRequest,
  type ScreenerResultRecord,
  type ScreenerResultSymbol
} from '@services/strategyApi';
import { formatTimestamp } from './formatTimestamp';
import styles from './ScreenerResultsPanel.module.css';

interface ScreenerResultsPanelProps {
  strategyId: string;
  showHeader?: boolean;
  showActions?: boolean;
  variant?: 'default' | 'embedded';
  onSummaryChange?: (summary: {
    lastResultCount: number | null;
    lastError: string | null;
  }) => void;
}

type RequestStatus = 'idle' | 'loading' | 'succeeded' | 'failed';
type SortDirection = 'asc' | 'desc';

export type ScreenerResultsPanelHandle = {
  run: () => void;
  refresh: () => void;
};

const formatNumber = (value: number | null | undefined, digits = 2): string => {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return '—';
  }
  return value.toLocaleString(undefined, { maximumFractionDigits: digits });
};

const formatValue = (value: unknown): string => {
  if (value === null || value === undefined || value === '') {
    return '—';
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value.toLocaleString();
  }
  return String(value);
};

const formatPercentValue = (value: unknown): string => {
  if (value === null || value === undefined || value === '') {
    return '—';
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return `${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}%`;
  }
  if (typeof value === 'string') {
    return value;
  }
  return String(value);
};

const getMetadataValue = (metadata: Record<string, unknown> | null | undefined, keys: string[]) => {
  if (!metadata) {
    return null;
  }
  for (const key of keys) {
    const value = metadata[key];
    if (value !== null && value !== undefined && value !== '') {
      return value;
    }
  }
  return null;
};

const toNumber = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return null;
};

const toText = (value: unknown): string => {
  if (value === null || value === undefined) {
    return '';
  }
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value.toString();
  }
  return String(value);
};

const ScreenerResultsPanel = forwardRef<ScreenerResultsPanelHandle, ScreenerResultsPanelProps>(
  (
    { strategyId, showHeader = true, showActions = true, variant = 'default', onSummaryChange },
    ref
  ) => {
    const isEmbedded = variant === 'embedded';
    const dispatch = useAppDispatch();
    const token = useAppSelector((state) => state.auth.token);
    const [history, setHistory] = useState<ScreenerResultRecord[]>([]);
    const [historyStatus, setHistoryStatus] = useState<RequestStatus>('idle');
    const [detailStatus, setDetailStatus] = useState<RequestStatus>('idle');
    const [detail, setDetail] = useState<ScreenerResultRecord | null>(null);
    const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
    const [lastResultCount, setLastResultCount] = useState<number | null>(null);
    const [panelError, setPanelError] = useState<string | null>(null);
    const [sortKey, setSortKey] = useState<string>('symbol');
    const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

    const selectedRun = useMemo(() => {
      if (!selectedRunId) {
        return null;
      }
      return history.find((entry) => entry.runId === selectedRunId) ?? null;
    }, [history, selectedRunId]);

    const columns = useMemo(
      () => [
        {
          key: 'symbol',
          label: 'Symbol',
          sortType: 'string',
          getValue: (symbol: ScreenerResultSymbol) => symbol.symbol
        },
        {
          key: 'preMarketVol',
          label: 'Pre-market Vol',
          sortType: 'number',
          getValue: (symbol: ScreenerResultSymbol) =>
            getMetadataValue(symbol.metadata, [
              'preMarketVolume',
              'pre_market_volume',
              'premarket_volume',
              'preMarketVol',
              'pre_market_vol',
              'premarketVol',
              'premarket_volume_total'
            ]),
          format: (value: unknown) => formatNumber(value as number, 0)
        },
        {
          key: 'preMarketChgPct',
          label: 'Pre-market Chg %',
          sortType: 'number',
          getValue: (symbol: ScreenerResultSymbol) =>
            getMetadataValue(symbol.metadata, [
              'preMarketChangePercent',
              'pre_market_change_percent',
              'preMarketChgPct',
              'pre_market_chg_pct',
              'premarketChangePercent',
              'premarket_chg_pct'
            ]),
          format: formatPercentValue
        },
        {
          key: 'preMarketGapPct',
          label: 'Pre-market Gap %',
          sortType: 'number',
          getValue: (symbol: ScreenerResultSymbol) =>
            getMetadataValue(symbol.metadata, [
              'preMarketGapPercent',
              'pre_market_gap_percent',
              'preMarketGapPct',
              'pre_market_gap_pct',
              'premarketGapPercent',
              'premarket_gap_pct'
            ]),
          format: formatPercentValue
        },
        {
          key: 'changePct',
          label: 'Change %',
          sortType: 'number',
          getValue: (symbol: ScreenerResultSymbol) =>
            getMetadataValue(symbol.metadata, [
              'changePercent',
              'change_percent',
              'chgPercent',
              'chg_percent',
              'percentChange',
              'percent_change'
            ]),
          format: formatPercentValue
        },
        {
          key: 'postMarketChgPct',
          label: 'Post-market Chg %',
          sortType: 'number',
          getValue: (symbol: ScreenerResultSymbol) =>
            getMetadataValue(symbol.metadata, [
              'postMarketChangePercent',
              'post_market_change_percent',
              'postMarketChgPct',
              'post_market_chg_pct',
              'postmarketChangePercent',
              'postmarket_chg_pct'
            ]),
          format: formatPercentValue
        },
        {
          key: 'preMarketPrice',
          label: 'Pre-market Price',
          sortType: 'number',
          getValue: (symbol: ScreenerResultSymbol) =>
            getMetadataValue(symbol.metadata, [
              'preMarketPrice',
              'pre_market_price',
              'premarketPrice',
              'premarket_price'
            ]),
          format: (value: unknown) => formatNumber(value as number, 4)
        },
        {
          key: 'price',
          label: 'Price',
          sortType: 'number',
          getValue: (symbol: ScreenerResultSymbol) =>
            getMetadataValue(symbol.metadata, [
              'price',
              'lastPrice',
              'last_price',
              'marketPrice',
              'market_price',
              'close',
              'close_price'
            ]),
          format: (value: unknown) => formatNumber(value as number, 4)
        },
        {
          key: 'volume',
          label: 'Volume',
          sortType: 'number',
          getValue: (symbol: ScreenerResultSymbol) =>
            getMetadataValue(symbol.metadata, [
              'volume',
              'totalVolume',
              'total_volume',
              'dailyVolume',
              'daily_volume'
            ]),
          format: (value: unknown) => formatNumber(value as number, 0)
        },
        {
          key: 'gapPct',
          label: 'Gap %',
          sortType: 'number',
          getValue: (symbol: ScreenerResultSymbol) =>
            getMetadataValue(symbol.metadata, [
              'gapPercent',
              'gap_percent',
              'gapPct',
              'gap_pct'
            ]),
          format: formatPercentValue
        },
        {
          key: 'volChangePct',
          label: 'Vol Change %',
          sortType: 'number',
          getValue: (symbol: ScreenerResultSymbol) =>
            getMetadataValue(symbol.metadata, [
              'volumeChangePercent',
              'volume_change_percent',
              'volChangePercent',
              'vol_change_percent',
              'volChgPct',
              'vol_chg_pct'
            ]),
          format: formatPercentValue
        },
        {
          key: 'postMarketPrice',
          label: 'Post-market Price',
          sortType: 'number',
          getValue: (symbol: ScreenerResultSymbol) =>
            getMetadataValue(symbol.metadata, [
              'postMarketPrice',
              'post_market_price',
              'postmarketPrice',
              'postmarket_price'
            ]),
          format: (value: unknown) => formatNumber(value as number, 4)
        },
        {
          key: 'postMarketVol',
          label: 'Post-market Vol',
          sortType: 'number',
          getValue: (symbol: ScreenerResultSymbol) =>
            getMetadataValue(symbol.metadata, [
              'postMarketVolume',
              'post_market_volume',
              'postMarketVol',
              'post_market_vol',
              'postmarketVolume',
              'postmarketVol'
            ]),
          format: (value: unknown) => formatNumber(value as number, 0)
        }
      ],
      []
    );

    const handleSort = useCallback(
      (key: string) => {
        if (key === sortKey) {
          setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
          return;
        }
        setSortKey(key);
        setSortDirection('asc');
      },
      [sortKey]
    );

    const sortedSymbols = useMemo(() => {
      if (!detail?.symbols) {
        return [];
      }
      const activeColumn = columns.find((column) => column.key === sortKey) ?? columns[0];
      const direction = sortDirection === 'asc' ? 1 : -1;
      return [...detail.symbols].sort((left, right) => {
        const leftValue = activeColumn.getValue(left);
        const rightValue = activeColumn.getValue(right);
        if (activeColumn.sortType === 'number') {
          const leftNumber = toNumber(leftValue);
          const rightNumber = toNumber(rightValue);
          if (leftNumber === null && rightNumber === null) {
            return 0;
          }
          if (leftNumber === null) {
            return 1;
          }
          if (rightNumber === null) {
            return -1;
          }
          return (leftNumber - rightNumber) * direction;
        }
        const leftText = toText(leftValue);
        const rightText = toText(rightValue);
        return leftText.localeCompare(rightText, undefined, { numeric: true, sensitivity: 'base' }) * direction;
      });
    }, [columns, detail?.symbols, sortDirection, sortKey]);

    const loadHistory = useCallback(async () => {
      if (!token) {
        return;
      }
      setHistoryStatus('loading');
      try {
        const results = await listScreenerResults(token, strategyId);
        setHistory(results);
        setHistoryStatus('succeeded');
        setPanelError(null);
        if (!selectedRunId && results.length) {
          setSelectedRunId(results[0].runId);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : '加载筛选历史失败';
        setHistoryStatus('failed');
        setPanelError(message);
        dispatch(addToast({ message, variant: 'error', preventDuplicates: true }));
      }
    }, [dispatch, selectedRunId, strategyId, token]);

    const loadDetail = useCallback(async () => {
      if (!token || !selectedRunId) {
        return;
      }
      setDetailStatus('loading');
      try {
        const result = await fetchScreenerResult(token, strategyId, selectedRunId);
        setDetail(result);
        setDetailStatus('succeeded');
        setPanelError(null);
        setLastResultCount(Array.isArray(result?.symbols) ? result?.symbols.length : null);
      } catch (error) {
        const message = error instanceof Error ? error.message : '加载筛选明细失败';
        setDetailStatus('failed');
        setPanelError(message);
        dispatch(addToast({ message, variant: 'error', preventDuplicates: true }));
      }
    }, [dispatch, selectedRunId, strategyId, token]);

    const handleRun = useCallback(async () => {
      if (!token) {
        return;
      }
      try {
        const run = await runScreenerRequest(token, strategyId);
        const runId = typeof run?.run_id === 'string' ? run.run_id : null;
        const resultCount = typeof run?.result_count === 'number' ? run.result_count : null;
        await loadHistory();
        if (runId) {
          setSelectedRunId(runId);
          setDetailStatus('loading');
          const result = await fetchScreenerResult(token, strategyId, runId);
          setDetail(result);
          setDetailStatus('succeeded');
          setLastResultCount(Array.isArray(result?.symbols) ? result?.symbols.length : null);
        }
        if (resultCount !== null) {
          setLastResultCount(resultCount);
        }
        setPanelError(null);
        dispatch(addToast({ message: '筛选任务已触发', variant: 'success', preventDuplicates: true }));
      } catch (error) {
        const message = error instanceof Error ? error.message : '触发筛选失败';
        setPanelError(message);
        dispatch(addToast({ message, variant: 'error', preventDuplicates: true }));
      }
    }, [dispatch, loadHistory, strategyId, token]);

    const handleRefresh = useCallback(() => {
      void loadHistory();
      void loadDetail();
    }, [loadDetail, loadHistory]);

    useImperativeHandle(
      ref,
      () => ({
        run: () => {
          void handleRun();
        },
        refresh: handleRefresh
      }),
      [handleRefresh, handleRun]
    );

    useEffect(() => {
      if (!strategyId) {
        return;
      }
      void loadHistory();
    }, [loadHistory, strategyId]);

    useEffect(() => {
      void loadDetail();
    }, [loadDetail]);

    useEffect(() => {
      onSummaryChange?.({ lastResultCount, lastError: panelError });
    }, [lastResultCount, onSummaryChange, panelError]);

    return (
      <div className={`${styles.panel} ${isEmbedded ? styles.panelEmbedded : ''}`}>
        {showHeader || showActions ? (
          <div className={styles.headerRow}>
            {showHeader ? (
              <div>
                <div className={`${styles.title} ${isEmbedded ? styles.titleEmbedded : ''}`}>
                  Screener Results
                </div>
                <div className={`${styles.subtitle} ${isEmbedded ? styles.subtitleEmbedded : ''}`}>
                  查看历史筛选记录与单次结果明细。
                </div>
              </div>
            ) : null}
            {showActions ? (
              <div className={styles.actions}>
                <button type="button" className={styles.primaryButton} onClick={handleRun}>
                  手动筛选
                </button>
                <button type="button" className={styles.secondaryButton} onClick={handleRefresh}>
                  刷新
                </button>
              </div>
            ) : null}
          </div>
        ) : null}

        <div className={`${styles.contentGrid} ${isEmbedded ? styles.contentGridEmbedded : ''}`}>
          <div className={`${styles.card} ${isEmbedded ? styles.cardEmbedded : ''}`}>
            <div className={`${styles.cardHeader} ${isEmbedded ? styles.cardHeaderEmbedded : ''}`}>
              历史记录
            </div>
            {historyStatus === 'loading' ? (
              <div className={styles.emptyState}>加载中...</div>
            ) : history.length === 0 ? (
              <div className={styles.emptyState}>暂无筛选记录。</div>
            ) : (
              <ul className={styles.historyList}>
                {history.map((entry) => {
                  const isActive = entry.runId === selectedRunId;
                  const formattedRunAt = formatTimestamp(entry.runAt);
                  const title = formattedRunAt !== '—' ? formattedRunAt : entry.tradingDate ?? '筛选记录';
                  return (
                    <li key={entry.runId}>
                      <button
                        type="button"
                        className={`${styles.historyItem} ${
                          isEmbedded ? styles.historyItemEmbedded : ''
                        } ${isActive ? styles.historyItemActive : ''}`}
                        onClick={() => setSelectedRunId(entry.runId)}
                      >
                        <div className={styles.historyTitle}>{title}</div>
                        <div className={styles.historyMeta}>
                          <span>Trading: {entry.tradingDate ?? '—'}</span>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className={`${styles.card} ${isEmbedded ? styles.cardEmbedded : ''}`}>
            <div className={`${styles.cardHeader} ${isEmbedded ? styles.cardHeaderEmbedded : ''}`}>
              单次明细
            </div>
            {detailStatus === 'loading' ? (
              <div className={styles.emptyState}>加载明细中...</div>
            ) : !selectedRun ? (
              <div className={styles.emptyState}>请选择左侧记录查看明细。</div>
            ) : !detail || !detail.symbols || detail.symbols.length === 0 ? (
              <div className={styles.emptyState}>暂无明细数据。</div>
            ) : (
              <div className={styles.tableWrapper}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      {columns.map((column) => {
                        const isActive = column.key === sortKey;
                        const icon = isActive && sortDirection === 'desc' ? '▼' : '▲';
                        return (
                          <th key={column.key}>
                            <button
                              type="button"
                              className={`${styles.sortButton} ${isActive ? styles.sortButtonActive : ''}`}
                              onClick={() => handleSort(column.key)}
                            >
                              {column.label}
                              <span className={`${styles.sortIcon} ${isActive ? styles.sortIconActive : ''}`}>
                                {icon}
                              </span>
                            </button>
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {sortedSymbols.map((symbol) => (
                      <tr key={symbol.id}>
                        {columns.map((column) => {
                          const value = column.getValue(symbol);
                          const content = column.format ? column.format(value) : formatValue(value);
                          return <td key={`${symbol.id}-${column.key}`}>{content}</td>;
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }
);

ScreenerResultsPanel.displayName = 'ScreenerResultsPanel';

export default ScreenerResultsPanel;
