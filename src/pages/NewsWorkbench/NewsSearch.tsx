import { useEffect, useMemo, useState } from 'react';
import type { NewsArticle, SentimentSignal } from '@services/newsService';
import styles from './NewsWorkbench.module.css';

export interface NewsSearchFilters {
  symbol: string;
  keyword: string;
  limit: number;
}

export interface NewsSearchProps {
  filters: NewsSearchFilters;
  loading: boolean;
  news: NewsArticle[];
  total: number;
  lastUpdated?: string | null;
  recentSignals: SentimentSignal[];
  onSearch: (filters: NewsSearchFilters) => void;
  error?: string | null;
}

const formatDateTime = (value: string): string => {
  try {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return value;
    }
    return `${date.toLocaleDateString()} ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  } catch (_error) {
    return value;
  }
};

const clampLimit = (value: number): number => {
  if (!Number.isFinite(value)) {
    return 20;
  }
  return Math.min(Math.max(Math.floor(value), 1), 100);
};

const calculateSignalSummary = (signals: SentimentSignal[]) => {
  if (signals.length === 0) {
    return {
      averageProbability: 0,
      positiveCount: 0,
      negativeCount: 0,
      sampleSize: 0
    };
  }
  let probabilitySum = 0;
  let positiveCount = 0;
  let negativeCount = 0;
  for (const signal of signals) {
    probabilitySum += signal.probability;
    if (signal.rating >= 4) {
      positiveCount += 1;
    } else if (signal.rating <= 2) {
      negativeCount += 1;
    }
  }
  return {
    averageProbability: probabilitySum / signals.length,
    positiveCount,
    negativeCount,
    sampleSize: signals.length
  };
};

function NewsSearch({ filters, loading, news, total, lastUpdated, recentSignals, onSearch, error }: NewsSearchProps) {
  const [symbol, setSymbol] = useState(filters.symbol);
  const [keyword, setKeyword] = useState(filters.keyword);
  const [limit, setLimit] = useState(filters.limit);

  useEffect(() => {
    setSymbol(filters.symbol);
    setKeyword(filters.keyword);
    setLimit(filters.limit);
  }, [filters.symbol, filters.keyword, filters.limit]);

  const summary = useMemo(() => calculateSignalSummary(recentSignals), [recentSignals]);

  const filteredNews = useMemo(() => {
    if (!keyword.trim()) {
      return news;
    }
    const lowered = keyword.trim().toLowerCase();
    return news.filter((item) =>
      item.title.toLowerCase().includes(lowered) || item.summary.toLowerCase().includes(lowered)
    );
  }, [keyword, news]);

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSearch({
      symbol: symbol.trim().toUpperCase(),
      keyword: keyword.trim(),
      limit: clampLimit(limit)
    });
  };

  return (
    <section className={styles.section} aria-label="news-search">
      <div className={styles.sectionHeader}>
        <div>
          <h2 className={styles.sectionTitle}>新闻检索</h2>
          <p className={styles.sectionDescription}>
            查询最新的新闻样本并查看情绪信号摘要，支持按标的与关键词过滤。
          </p>
        </div>
        {lastUpdated ? (
          <span className={styles.sectionDescription}>最近更新：{formatDateTime(lastUpdated)}</span>
        ) : null}
      </div>
      <div className={styles.sectionBody}>
        <form className={styles.formRow} onSubmit={handleSubmit}>
          <div className={styles.formControl}>
            <label htmlFor="news-symbol">交易标的</label>
            <input
              id="news-symbol"
              value={symbol}
              onChange={(event) => setSymbol(event.target.value)}
              placeholder="如 BTC-USDT"
            />
          </div>
          <div className={styles.formControl}>
            <label htmlFor="news-keyword">关键词过滤</label>
            <input
              id="news-keyword"
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              placeholder="可选，按标题/摘要过滤"
            />
          </div>
          <div className={styles.formControl}>
            <label htmlFor="news-limit">返回条数</label>
            <input
              id="news-limit"
              type="number"
              min={1}
              max={100}
              value={limit}
              onChange={(event) => setLimit(Number.parseInt(event.target.value, 10) || 0)}
            />
          </div>
          <div className={styles.formActions}>
            <button className={styles.primaryButton} type="submit" disabled={loading}>
              {loading ? '加载中…' : '执行检索'}
            </button>
          </div>
        </form>
        <div className={styles.signalSummary}>
          <div className={styles.summaryCard}>
            <span className={styles.summaryLabel}>样本数量</span>
            <span className={styles.summaryValue}>{summary.sampleSize}</span>
          </div>
          <div className={styles.summaryCard}>
            <span className={styles.summaryLabel}>平均情绪概率</span>
            <span className={styles.summaryValue}>{summary.averageProbability.toFixed(2)}</span>
          </div>
          <div className={styles.summaryCard}>
            <span className={styles.summaryLabel}>积极信号</span>
            <span className={styles.summaryValue}>{summary.positiveCount}</span>
          </div>
          <div className={styles.summaryCard}>
            <span className={styles.summaryLabel}>消极信号</span>
            <span className={styles.summaryValue}>{summary.negativeCount}</span>
          </div>
        </div>
        <div>
          <p className={styles.sectionDescription}>
            共返回 {filteredNews.length} / {total} 条记录。
          </p>
        </div>
        {error ? <p className={styles.errorText}>{error}</p> : null}
        {filteredNews.length === 0 ? (
          <p className={styles.emptyState}>暂无符合条件的新闻，请调整过滤条件后重试。</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">时间</th>
                  <th scope="col">标题</th>
                  <th scope="col">来源</th>
                  <th scope="col">标的</th>
                  <th scope="col">情绪</th>
                </tr>
              </thead>
              <tbody>
                {filteredNews.map((item) => (
                  <tr key={item.id}>
                    <td>{formatDateTime(item.publishedAt)}</td>
                    <td>{item.title}</td>
                    <td>{item.source}</td>
                    <td>
                      <div className={styles.badgeGroup}>
                        {item.symbols.length > 0
                          ? item.symbols.map((symbolEntry) => (
                              <span key={symbolEntry} className={styles.badge}>
                                {symbolEntry}
                              </span>
                            ))
                          : '—'}
                      </div>
                    </td>
                    <td>{item.sentiment.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}

export default NewsSearch;
