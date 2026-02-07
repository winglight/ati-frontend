import { useCallback, useEffect, useMemo, useState } from 'react';
import PageHeader from '../components/PageHeader';
import layoutStyles from '../PageLayout.module.css';
import NewsLlmTradeNav from './NewsLlmTradeNav';
import styles from './NewsLlmTrade.module.css';
import { fetchNewsLlmSignals, type NewsLlmSignalEntry } from '@services/newsLlmTrade';
import { useAppSelector } from '@store/hooks';

const formatTimestamp = (value?: string | null): string => {
  if (!value) {
    return '—';
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return `${parsed.toLocaleDateString()} ${parsed.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  })}`;
};

function NewsLlmTradeSignalsPage() {
  const token = useAppSelector((state) => state.auth.token);
  const [symbol, setSymbol] = useState('');
  const [status, setStatus] = useState('');
  const [executionStatus, setExecutionStatus] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [signals, setSignals] = useState<NewsLlmSignalEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadSignals = useCallback(async () => {
    if (!token) {
      setError('当前尚未登录，无法查询交易信号。');
      setSignals([]);
      setTotal(0);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await fetchNewsLlmSignals(token, {
        symbol: symbol || null,
        status: status || null,
        executionStatus: executionStatus || null,
        page,
        pageSize
      });
      setSignals(response.items);
      setTotal(response.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : '获取交易信号失败');
    } finally {
      setLoading(false);
    }
  }, [token, symbol, status, executionStatus, page, pageSize]);

  useEffect(() => {
    void loadSignals();
  }, [loadSignals]);

  const totalPages = useMemo(() => {
    if (pageSize <= 0) {
      return 1;
    }
    const computed = Math.ceil(total / pageSize);
    return computed > 0 ? computed : 1;
  }, [total, pageSize]);

  return (
    <div className={layoutStyles.page}>
      <PageHeader
        title="News LLM Trade"
        description="查看新闻信号生成结果与策略执行状态。"
        actions={[
          {
            label: loading ? '刷新中…' : '刷新信号',
            variant: 'outline',
            onClick: loadSignals,
            disabled: loading
          }
        ]}
      />
      <div className={styles.pageContent}>
        <NewsLlmTradeNav />

        <section className={styles.panel}>
          <div className={styles.sectionHeader}>
            <div>
              <h2 className={styles.sectionTitle}>筛选条件</h2>
              <div className={styles.sectionHint}>按 symbol 与执行状态筛选交易信号。</div>
            </div>
          </div>
          <div className={styles.formGrid}>
            <div className={styles.field}>
              <label className={styles.label}>Symbol</label>
              <input
                className={styles.input}
                value={symbol}
                onChange={(event) => {
                  setSymbol(event.target.value);
                  setPage(1);
                }}
                placeholder="AAPL / TSLA"
              />
            </div>
            <div className={styles.field}>
              <label className={styles.label}>信号状态</label>
              <input
                className={styles.input}
                value={status}
                onChange={(event) => {
                  setStatus(event.target.value);
                  setPage(1);
                }}
                placeholder="new / approved"
              />
            </div>
            <div className={styles.field}>
              <label className={styles.label}>执行状态</label>
              <input
                className={styles.input}
                value={executionStatus}
                onChange={(event) => {
                  setExecutionStatus(event.target.value);
                  setPage(1);
                }}
                placeholder="submitted / filled"
              />
            </div>
            <div className={styles.field}>
              <label className={styles.label}>每页数量</label>
              <select
                className={styles.select}
                value={pageSize}
                onChange={(event) => {
                  setPageSize(Number(event.target.value));
                  setPage(1);
                }}
              >
                {[10, 20, 50].map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {error ? <div className={`${styles.statusMessage} ${styles.statusError}`}>{error}</div> : null}
        </section>

        <section className={styles.panel}>
          <div className={styles.sectionHeader}>
            <div>
              <h2 className={styles.sectionTitle}>交易信号</h2>
              <div className={styles.sectionHint}>共 {total} 条记录。</div>
            </div>
          </div>
          <div className={styles.tableWrapper}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>时间</th>
                  <th>Symbol</th>
                  <th>评分/置信度</th>
                  <th>信号状态</th>
                  <th>策略执行</th>
                </tr>
              </thead>
              <tbody>
                {signals.length === 0 && !loading ? (
                  <tr>
                    <td colSpan={5} className={styles.emptyCell}>
                      暂无交易信号，请稍后重试。
                    </td>
                  </tr>
                ) : null}
                {signals.map((signal) => (
                  <tr key={signal.id}>
                    <td>{formatTimestamp(signal.createdAt)}</td>
                    <td>{signal.symbol}</td>
                    <td>
                      <div>评分: {signal.rating.toFixed(2)}</div>
                      <div className={styles.inlineTag}>置信度: {signal.confidence.toFixed(2)}</div>
                    </td>
                    <td>
                      <span className={styles.badge}>{signal.status || 'unknown'}</span>
                    </td>
                    <td>
                      <div>{signal.strategy ?? '—'}</div>
                      <div className={styles.inlineTag}>订单: {signal.orderId ?? '—'}</div>
                      <div className={styles.inlineTag}>执行状态: {signal.executionStatus ?? '—'}</div>
                      {signal.executionMessage ? (
                        <pre className={styles.codeBlock}>{signal.executionMessage}</pre>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className={styles.paginationBar}>
            <div className={styles.paginationInfo}>
              第 {page} / {totalPages} 页 · 每页 {pageSize} 条
            </div>
            <div className={styles.paginationControls}>
              <button
                type="button"
                className={styles.pageButton}
                onClick={() => setPage((prev) => Math.max(prev - 1, 1))}
                disabled={page <= 1 || loading}
              >
                上一页
              </button>
              <button
                type="button"
                className={styles.pageButton}
                onClick={() => setPage((prev) => Math.min(prev + 1, totalPages))}
                disabled={loading || page >= totalPages}
              >
                下一页
              </button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

export default NewsLlmTradeSignalsPage;
