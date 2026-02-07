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
  type ScreenerResultRecord
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

const formatReturnRate = (value: number | null | undefined): string => {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return '—';
  }
  return `${(value * 100).toFixed(2)}%`;
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

    const selectedRun = useMemo(() => {
      if (!selectedRunId) {
        return null;
      }
      return history.find((entry) => entry.runId === selectedRunId) ?? null;
    }, [history, selectedRunId]);

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
                  return (
                    <li key={entry.runId}>
                      <button
                        type="button"
                        className={`${styles.historyItem} ${
                          isEmbedded ? styles.historyItemEmbedded : ''
                        } ${isActive ? styles.historyItemActive : ''}`}
                        onClick={() => setSelectedRunId(entry.runId)}
                      >
                        <div className={styles.historyTitle}>{entry.runId}</div>
                        <div className={styles.historyMeta}>
                          <span>Run: {formatTimestamp(entry.runAt)}</span>
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
                      <th>Symbol</th>
                      <th>Open</th>
                      <th>Close</th>
                      <th>Return %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.symbols.map((symbol) => (
                      <tr key={symbol.id}>
                        <td>{symbol.symbol}</td>
                        <td>{formatNumber(symbol.openPrice, 4)}</td>
                        <td>{formatNumber(symbol.closePrice, 4)}</td>
                        <td>{formatReturnRate(symbol.returnRate)}</td>
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
