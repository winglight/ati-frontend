import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import PageHeader from '../components/PageHeader';
import layoutStyles from '../PageLayout.module.css';
import styles from './NewsWorkbench.module.css';
import NewsSearch, { type NewsSearchFilters } from './NewsSearch';
import TrainingDashboard from './TrainingDashboard';
import {
  activateModelVersion,
  fetchModelMetadata,
  fetchNews,
  fetchRecentSignals,
  submitTrainingJob,
  subscribeToNewsEvents,
  type ModelMetadata,
  type NewsArticle,
  type NewsServiceEvent,
  type SentimentSignal
} from '@services/newsService';
import { useAppSelector } from '@store/hooks';

const DEFAULT_FILTERS: NewsSearchFilters = {
  symbol: '',
  keyword: '',
  limit: 20
};

const EVENTS_LIMIT = 100;
const SIGNAL_LIMIT = 60;

const extractVersion = (payload: Record<string, unknown>, key: string): string | null => {
  const value = payload[key];
  if (typeof value === 'string' && value) {
    return value;
  }
  const camelKey = key.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());
  const camelValue = payload[camelKey];
  if (typeof camelValue === 'string' && camelValue) {
    return camelValue;
  }
  return null;
};

function NewsWorkbenchPage() {
  const token = useAppSelector((state) => state.auth.token);

  const [filters, setFilters] = useState<NewsSearchFilters>(DEFAULT_FILTERS);
  const [news, setNews] = useState<NewsArticle[]>([]);
  const [newsTotal, setNewsTotal] = useState(0);
  const [newsLoading, setNewsLoading] = useState(false);
  const [newsError, setNewsError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);

  const [recentSignals, setRecentSignals] = useState<SentimentSignal[]>([]);
  const [events, setEvents] = useState<NewsServiceEvent[]>([]);
  const [modelMetadata, setModelMetadata] = useState<Record<string, ModelMetadata>>({});
  const [activeModelVersion, setActiveModelVersion] = useState<string | null>(null);

  const [submittingTraining, setSubmittingTraining] = useState(false);
  const [submissionError, setSubmissionError] = useState<string | null>(null);

  const metadataCacheRef = useRef<Record<string, ModelMetadata>>({});
  const pendingMetadataRef = useRef(new Set<string>());

  useEffect(() => {
    metadataCacheRef.current = modelMetadata;
  }, [modelMetadata]);

  const ensureModelMetadata = useCallback(
    async (version: string | null | undefined) => {
      if (!token || !version || metadataCacheRef.current[version] || pendingMetadataRef.current.has(version)) {
        return;
      }
      pendingMetadataRef.current.add(version);
      try {
        const metadata = await fetchModelMetadata(version, token);
        if (metadata) {
          setModelMetadata((prev) => ({ ...prev, [version]: metadata }));
        }
      } catch (error) {
        console.warn('[NewsWorkbench] 获取模型元数据失败', error);
      } finally {
        pendingMetadataRef.current.delete(version);
      }
    },
    [token]
  );

  const loadSignals = useCallback(async () => {
    if (!token) {
      setRecentSignals([]);
      return;
    }
    try {
      const signals = await fetchRecentSignals(token, SIGNAL_LIMIT);
      setRecentSignals(signals);
      if (signals.length > 0) {
        setActiveModelVersion((current) => current ?? signals[0].modelVersion);
        for (const signal of signals) {
          void ensureModelMetadata(signal.modelVersion);
        }
      }
    } catch (error) {
      console.warn('[NewsWorkbench] 获取情绪信号失败', error);
    }
  }, [token, ensureModelMetadata]);

  const loadNews = useCallback(
    async (searchFilters: NewsSearchFilters) => {
      if (!token) {
        setNews([]);
        setNewsTotal(0);
        setNewsError('当前尚未登录，无法查询新闻。');
        return;
      }
      setNewsLoading(true);
      setNewsError(null);
      try {
        const result = await fetchNews({ symbol: searchFilters.symbol, limit: searchFilters.limit }, token);
        setNews(result.items);
        setNewsTotal(result.total);
        setLastUpdated(new Date().toISOString());
      } catch (error) {
        setNewsError(error instanceof Error ? error.message : '获取新闻失败');
      } finally {
        setNewsLoading(false);
      }
    },
    [token]
  );

  useEffect(() => {
    if (!token) {
      setNews([]);
      setNewsTotal(0);
      setNewsError('当前尚未登录，无法查询新闻。');
      return;
    }
    void loadNews(filters);
  }, [token, filters, loadNews]);

  useEffect(() => {
    if (!token) {
      setRecentSignals([]);
      setEvents([]);
      setActiveModelVersion(null);
      return;
    }
    void loadSignals();
  }, [token, loadSignals]);

  useEffect(() => {
    if (!token) {
      return;
    }
    const subscription = subscribeToNewsEvents({
      tokenProvider: () => token,
      onEvent: (event) => {
        setEvents((prev) => [event, ...prev].slice(0, EVENTS_LIMIT));
        if (event.type === 'model_activation') {
          const version = extractVersion(event.payload, 'version');
          if (version) {
            setActiveModelVersion(version);
            void ensureModelMetadata(version);
          }
          void loadSignals();
        } else if (event.type === 'prediction') {
          const version = extractVersion(event.payload, 'model_version');
          if (version) {
            void ensureModelMetadata(version);
          }
          void loadSignals();
        }
      },
      onError: (errorEvent) => {
        console.warn('[NewsWorkbench] WebSocket 错误', errorEvent);
      }
    });
    return () => {
      subscription.dispose();
    };
  }, [token, ensureModelMetadata, loadSignals]);

  const handleSearch = useCallback((nextFilters: NewsSearchFilters) => {
    setFilters(nextFilters);
  }, []);

  const handleSubmitTraining = useCallback(
    async (payload: { dataset: string; notes?: string | null }) => {
      if (!token) {
        setSubmissionError('当前尚未登录，无法提交训练任务。');
        return;
      }
      setSubmittingTraining(true);
      setSubmissionError(null);
      try {
        await submitTrainingJob({ dataset: payload.dataset, notes: payload.notes ?? null, hyperparameters: null }, token);
      } catch (error) {
        setSubmissionError(error instanceof Error ? error.message : '提交训练任务失败');
      } finally {
        setSubmittingTraining(false);
      }
    },
    [token]
  );

  const handleActivateModel = useCallback(
    async (version: string) => {
      if (!token) {
        setSubmissionError('当前尚未登录，无法激活模型。');
        return;
      }
      try {
        await activateModelVersion(version, token);
        setActiveModelVersion(version);
        void ensureModelMetadata(version);
        void loadSignals();
      } catch (error) {
        setSubmissionError(error instanceof Error ? error.message : '激活模型失败');
      }
    },
    [token, ensureModelMetadata, loadSignals]
  );

  const searchFilters = useMemo(() => filters, [filters]);

  return (
    <div className={layoutStyles.page}>
      <PageHeader
        title="新闻情绪工作台"
        description="管理新闻采集、模型训练与实时推理，辅助趋势模型融合配置。"
      />
      <div className={styles.page}>
        <div className={styles.layout}>
          <NewsSearch
            filters={searchFilters}
            loading={newsLoading}
            news={news}
            total={newsTotal}
            lastUpdated={lastUpdated}
            recentSignals={recentSignals}
            onSearch={handleSearch}
            error={newsError}
          />
          <TrainingDashboard
            events={events}
            recentSignals={recentSignals}
            modelMetadata={modelMetadata}
            activeModelVersion={activeModelVersion}
            submitting={submittingTraining}
            submissionError={submissionError}
            onSubmitTraining={handleSubmitTraining}
            onActivateModel={handleActivateModel}
          />
        </div>
      </div>
    </div>
  );
}

export default NewsWorkbenchPage;

