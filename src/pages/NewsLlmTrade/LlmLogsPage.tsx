import { type ChangeEvent, useCallback, useEffect, useMemo, useState } from 'react';
import PageHeader from '../components/PageHeader';
import layoutStyles from '../PageLayout.module.css';
import NewsLlmTradeNav from './NewsLlmTradeNav';
import styles from './NewsLlmTrade.module.css';
import { fetchNewsLlmLogs, type NewsLlmLogEntry } from '@services/newsLlmTrade';
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

const toInputValue = (value: string | null): string => {
  if (!value) {
    return '';
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return '';
  }
  const pad = (num: number) => num.toString().padStart(2, '0');
  return `${parsed.getFullYear()}-${pad(parsed.getMonth() + 1)}-${pad(parsed.getDate())}T${pad(parsed.getHours())}:${pad(parsed.getMinutes())}`;
};

const fromInputValue = (value: string): string | null => {
  if (!value) {
    return null;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed.toISOString();
};

function NewsLlmTradeLogsPage() {
  const token = useAppSelector((state) => state.auth.token);
  const [status, setStatus] = useState('');
  const [startInput, setStartInput] = useState('');
  const [endInput, setEndInput] = useState('');
  const [start, setStart] = useState<string | null>(null);
  const [end, setEnd] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [logs, setLogs] = useState<NewsLlmLogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadLogs = useCallback(async () => {
    if (!token) {
      setError('当前尚未登录，无法查询 LLM 日志。');
      setLogs([]);
      setTotal(0);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await fetchNewsLlmLogs(token, {
        status: status || null,
        start,
        end,
        page,
        pageSize
      });
      setLogs(response.items);
      setTotal(response.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : '获取日志失败');
    } finally {
      setLoading(false);
    }
  }, [token, status, start, end, page, pageSize]);

  useEffect(() => {
    void loadLogs();
  }, [loadLogs]);

  const totalPages = useMemo(() => {
    if (pageSize <= 0) {
      return 1;
    }
    const computed = Math.ceil(total / pageSize);
    return computed > 0 ? computed : 1;
  }, [total, pageSize]);

  const handleStartChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value;
    setStartInput(value);
    const iso = fromInputValue(value);
    setStart(iso);
    setPage(1);
  }, []);

  const handleEndChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value;
    setEndInput(value);
    const iso = fromInputValue(value);
    setEnd(iso);
    setPage(1);
  }, []);

  useEffect(() => {
    setStartInput(toInputValue(start));
    setEndInput(toInputValue(end));
  }, [start, end]);

  const statusBadgeClass = (value: string) => {
    if (!value) {
      return styles.badgeMuted;
    }
    return value.toLowerCase().includes('fail') || value.toLowerCase().includes('error')
      ? styles.badgeMuted
      : styles.badge;
  };

  return (
    <div className={layoutStyles.page}>
      <PageHeader
        title="News LLM Trade"
        description="查看 LLM 请求/响应日志，支持时间与状态筛选。"
        actions={[
          {
            label: loading ? '刷新中…' : '刷新日志',
            variant: 'outline',
            onClick: loadLogs,
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
              <div className={styles.sectionHint}>按照时间范围与状态筛选日志。</div>
            </div>
          </div>
          <div className={styles.formGrid}>
            <div className={styles.field}>
              <label className={styles.label}>开始时间</label>
              <input
                type="datetime-local"
                className={styles.input}
                value={startInput}
                onChange={handleStartChange}
              />
            </div>
            <div className={styles.field}>
              <label className={styles.label}>结束时间</label>
              <input
                type="datetime-local"
                className={styles.input}
                value={endInput}
                onChange={handleEndChange}
              />
            </div>
            <div className={styles.field}>
              <label className={styles.label}>状态</label>
              <input
                className={styles.input}
                value={status}
                onChange={(event) => {
                  setStatus(event.target.value);
                  setPage(1);
                }}
                placeholder="success / failed"
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
              <h2 className={styles.sectionTitle}>LLM 请求日志</h2>
              <div className={styles.sectionHint}>共 {total} 条记录。</div>
            </div>
          </div>
          <div className={styles.tableWrapper}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>时间</th>
                  <th>状态</th>
                  <th>模型</th>
                  <th>耗时</th>
                  <th>Prompt</th>
                  <th>请求/响应</th>
                </tr>
              </thead>
              <tbody>
                {logs.length === 0 && !loading ? (
                  <tr>
                    <td colSpan={6} className={styles.emptyCell}>
                      暂无日志记录，调整筛选条件后重试。
                    </td>
                  </tr>
                ) : null}
                {logs.map((entry) => (
                  <tr key={entry.id}>
                    <td>{formatTimestamp(entry.createdAt)}</td>
                    <td>
                      <span className={`${styles.badge} ${statusBadgeClass(entry.status)}`}>
                        {entry.status || 'unknown'}
                      </span>
                    </td>
                    <td>{entry.model ?? '—'}</td>
                    <td>{entry.durationMs ? `${entry.durationMs} ms` : '—'}</td>
                    <td>
                      <div>{entry.promptId ?? '—'}</div>
                      {entry.symbol ? <div className={styles.inlineTag}>Symbol: {entry.symbol}</div> : null}
                    </td>
                    <td>
                      {entry.request ? <pre className={styles.codeBlock}>{entry.request}</pre> : null}
                      {entry.response ? <pre className={styles.codeBlock}>{entry.response}</pre> : null}
                      {entry.error ? <pre className={styles.codeBlock}>{entry.error}</pre> : null}
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

export default NewsLlmTradeLogsPage;
