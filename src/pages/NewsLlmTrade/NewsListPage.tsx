import { useCallback, useEffect, useMemo, useState } from 'react';
import PageHeader from '../components/PageHeader';
import layoutStyles from '../PageLayout.module.css';
import NewsLlmTradeNav from './NewsLlmTradeNav';
import styles from './NewsLlmTrade.module.css';
import { fetchNews, type NewsArticle } from '@services/newsService';
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

function NewsLlmTradeNewsListPage() {
  const token = useAppSelector((state) => state.auth.token);
  const [symbol, setSymbol] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [news, setNews] = useState<NewsArticle[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadNews = useCallback(async () => {
    if (!token) {
      setError('当前尚未登录，无法查询新闻。');
      setNews([]);
      setTotal(0);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await fetchNews({ symbol: symbol.trim(), limit: page * pageSize }, token);
      setNews(result.items);
      setTotal(result.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : '获取新闻失败');
    } finally {
      setLoading(false);
    }
  }, [token, symbol, page, pageSize]);

  useEffect(() => {
    void loadNews();
  }, [loadNews]);

  const handleSymbolChange = (value: string) => {
    setSymbol(value);
    setPage(1);
  };

  const totalPages = useMemo(() => {
    if (pageSize <= 0) {
      return 1;
    }
    const computed = Math.ceil(total / pageSize);
    return computed > 0 ? computed : 1;
  }, [total, pageSize]);

  const visibleNews = useMemo(() => {
    const start = (page - 1) * pageSize;
    return news.slice(start, start + pageSize);
  }, [news, page, pageSize]);

  return (
    <div className={layoutStyles.page}>
      <PageHeader
        title="News LLM Trade"
        description="按 symbol 查看订阅新闻列表与最新情绪摘要。"
        actions={[
          {
            label: loading ? '刷新中…' : '刷新数据',
            variant: 'outline',
            onClick: loadNews,
            disabled: loading
          }
        ]}
      />
      <div className={styles.pageContent}>
        <NewsLlmTradeNav />

        <section className={styles.panel}>
          <div className={styles.sectionHeader}>
            <div>
              <h2 className={styles.sectionTitle}>新闻筛选</h2>
              <div className={styles.sectionHint}>支持按 symbol 过滤与分页查看。</div>
            </div>
          </div>
          <div className={styles.formGrid}>
            <div className={styles.field}>
              <label className={styles.label}>Symbol</label>
              <input
                className={styles.input}
                value={symbol}
                onChange={(event) => handleSymbolChange(event.target.value)}
                placeholder="AAPL / NVDA / BTC"
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
              <h2 className={styles.sectionTitle}>订阅新闻</h2>
              <div className={styles.sectionHint}>共 {total} 条记录，当前第 {page} 页。</div>
            </div>
          </div>
          <div className={styles.tableWrapper}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>时间</th>
                  <th>来源</th>
                  <th>标题</th>
                  <th>Symbol</th>
                  <th>情绪</th>
                </tr>
              </thead>
              <tbody>
                {visibleNews.length === 0 && !loading ? (
                  <tr>
                    <td colSpan={5} className={styles.emptyCell}>
                      暂无新闻记录，调整筛选条件后重试。
                    </td>
                  </tr>
                ) : null}
                {visibleNews.map((item) => (
                  <tr key={item.id}>
                    <td>{formatTimestamp(item.publishedAt)}</td>
                    <td>{item.source ?? '—'}</td>
                    <td>{item.title}</td>
                    <td>{item.symbols.join(', ')}</td>
                    <td>{item.sentiment.toFixed(2)}</td>
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

export default NewsLlmTradeNewsListPage;
