import { resolveRequestUrl } from './config.js';
import type { ModelOpsJobType } from './aiModelOps.js';

export interface ModelOpsFusionOverview {
  enabled: boolean;
  strategy: 'early' | 'mid' | 'late';
  confidenceThreshold: number;
  newsWeight: number;
  newsModelVersion?: string | null;
}

export interface ModelOpsJobOverview {
  jobId: string;
  jobType: ModelOpsJobType;
  status: string;
  submittedAt?: string | null;
  symbol?: string | null;
  timeframe?: string | null;
}

export interface ModelOpsResultOverview {
  jobId: string;
  jobType: ModelOpsJobType;
  status: string;
  timestamp?: string | null;
  metrics: Record<string, number>;
}

export interface ModelOpsActiveModel {
  modelName: string;
  version: string;
  activatedAt?: string | null;
  reason?: string | null;
  metrics: Record<string, number>;
  newsModelVersion?: string | null;
}

export interface ModelOpsOverviewPayload {
  modelName: string;
  fusion: ModelOpsFusionOverview;
  activeModel?: ModelOpsActiveModel | null;
  recentJobs: ModelOpsJobOverview[];
  recentResults: ModelOpsResultOverview[];
}

export interface NewsSymbolHeatEntry {
  symbol: string;
  articles: number;
  avgSentiment: number;
}

export interface NewsHeadlineOverview {
  id: string;
  title: string;
  sentiment: number;
  publishedAt: string;
  source: string;
  symbols: string[];
}

export interface NewsSignalOverview {
  id: string;
  probability: number;
  rating: number;
  symbols: string[];
  modelVersion: string;
  createdAt: string;
}

export interface NewsActiveModelOverview {
  version: string;
  description?: string | null;
  metrics: Record<string, number>;
  registeredAt: string;
}

export interface NewsOverviewPayload {
  activeModel?: NewsActiveModelOverview | null;
  symbolHeat: NewsSymbolHeatEntry[];
  topHeadlines: NewsHeadlineOverview[];
  recentSignals: NewsSignalOverview[];
  pendingTrainingJobs: number;
}

type RequestInitOverrides = Omit<RequestInit, 'headers'> & {
  headers?: HeadersInit;
};

interface ModelOpsOverviewResponsePayload {
  model_name?: string;
  fusion?: {
    enabled?: boolean;
    strategy?: string;
    confidence_threshold?: number;
    news_weight?: number;
    news_model_version?: string | null;
  } | null;
  active_model?: {
    model_name?: string;
    version?: string;
    activated_at?: string | null;
    reason?: string | null;
    metrics?: Record<string, number> | null;
    news_model_version?: string | null;
  } | null;
  recent_jobs?: Array<{
    job_id?: string;
    job_type?: string;
    status?: string;
    submitted_at?: string | null;
    symbol?: string | null;
    timeframe?: string | null;
  }>;
  recent_results?: Array<{
    job_id?: string;
    job_type?: string;
    status?: string;
    timestamp?: string | null;
    metrics?: Record<string, number> | null;
  }>;
}

interface NewsOverviewResponsePayload {
  active_model?: {
    version?: string;
    description?: string | null;
    metrics?: Record<string, number> | null;
    registered_at?: string;
  } | null;
  symbol_heat?: Array<{
    symbol?: string;
    articles?: number;
    avg_sentiment?: number;
  }>;
  top_headlines?: Array<{
    id?: string;
    title?: string;
    sentiment?: number;
    published_at?: string;
    source?: string;
    symbols?: string[];
  }>;
  recent_signals?: Array<{
    id?: string;
    probability?: number;
    rating?: number;
    symbols?: string[];
    model_version?: string;
    created_at?: string;
  }>;
  pending_training_jobs?: number;
}

const requestJson = async <T>(path: string, token: string, init: RequestInitOverrides = {}): Promise<T> => {
  const url = resolveRequestUrl(path);
  const headers: HeadersInit = {
    Accept: 'application/json',
    Authorization: `Bearer ${token}`,
    ...(init.headers ?? {})
  };

  const response = await fetch(url, {
    ...init,
    headers
  });

  if (response.status === 401) {
    throw new Error('认证信息已过期，请重新登录');
  }

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || '请求失败，请稍后重试');
  }

  return (await response.json()) as T;
};

const coerceJobType = (value: string | undefined): ModelOpsJobType => {
  return value === 'optimize' ? 'optimize' : 'training';
};

export const fetchModelOpsOverview = async (token: string): Promise<ModelOpsOverviewPayload> => {
  const payload = await requestJson<ModelOpsOverviewResponsePayload>('/ai-model-ops/overview', token);
  const fusion = payload.fusion ?? {};

  const modelFusion: ModelOpsFusionOverview = {
    enabled: Boolean(fusion.enabled),
    strategy: fusion.strategy === 'early' || fusion.strategy === 'mid' ? (fusion.strategy as 'early' | 'mid') : 'late',
    confidenceThreshold: fusion.confidence_threshold ?? 0.6,
    newsWeight: fusion.news_weight ?? 0.5,
    newsModelVersion: fusion.news_model_version ?? null
  };

  const activeModelPayload = payload.active_model;
  const activeModel: ModelOpsActiveModel | null = activeModelPayload
    ? {
        modelName: activeModelPayload.model_name ?? payload.model_name ?? 'trend_probability',
        version: activeModelPayload.version ?? 'unknown',
        activatedAt: activeModelPayload.activated_at ?? null,
        reason: activeModelPayload.reason ?? null,
        metrics: activeModelPayload.metrics ?? {},
        newsModelVersion: activeModelPayload.news_model_version ?? null
      }
    : null;

  const recentJobs: ModelOpsJobOverview[] = (payload.recent_jobs ?? []).map((job) => ({
    jobId: job.job_id ?? 'unknown',
    jobType: coerceJobType(job.job_type),
    status: job.status ?? 'unknown',
    submittedAt: job.submitted_at ?? null,
    symbol: job.symbol ?? null,
    timeframe: job.timeframe ?? null
  }));

  const recentResults: ModelOpsResultOverview[] = (payload.recent_results ?? []).map((item) => ({
    jobId: item.job_id ?? 'unknown',
    jobType: coerceJobType(item.job_type),
    status: item.status ?? 'unknown',
    timestamp: item.timestamp ?? null,
    metrics: item.metrics ?? {}
  }));

  return {
    modelName: payload.model_name ?? (activeModel?.modelName ?? 'trend_probability'),
    fusion: modelFusion,
    activeModel,
    recentJobs,
    recentResults
  };
};

const toNumber = (value: number | string | undefined): number => {
  if (value == null) {
    return 0;
  }
  const parsed = Number(value);
  return Number.isNaN(parsed) ? 0 : parsed;
};

export const fetchNewsOverview = async (token: string): Promise<NewsOverviewPayload> => {
  const payload = await requestJson<NewsOverviewResponsePayload>('/news-service/news/overview', token);
  const activeModelPayload = payload.active_model;
  const activeModel: NewsActiveModelOverview | null = activeModelPayload
    ? {
        version: activeModelPayload.version ?? 'unknown',
        description: activeModelPayload.description ?? null,
        metrics: activeModelPayload.metrics ?? {},
        registeredAt: activeModelPayload.registered_at ?? ''
      }
    : null;

  const symbolHeat: NewsSymbolHeatEntry[] = (payload.symbol_heat ?? []).map((entry) => ({
    symbol: entry.symbol ?? '未知',
    articles: entry.articles ?? 0,
    avgSentiment: entry.avg_sentiment ?? 0
  }));

  const topHeadlines: NewsHeadlineOverview[] = (payload.top_headlines ?? []).map((headline) => ({
    id: headline.id ?? 'unknown',
    title: headline.title ?? '未命名新闻',
    sentiment: headline.sentiment ?? 0,
    publishedAt: headline.published_at ?? '',
    source: headline.source ?? '未知来源',
    symbols: headline.symbols ?? []
  }));

  const recentSignals: NewsSignalOverview[] = (payload.recent_signals ?? []).map((signal) => ({
    id: signal.id ?? 'unknown',
    probability: toNumber(signal.probability),
    rating: toNumber(signal.rating),
    symbols: signal.symbols ?? [],
    modelVersion: signal.model_version ?? 'unknown',
    createdAt: signal.created_at ?? ''
  }));

  return {
    activeModel,
    symbolHeat,
    topHeadlines,
    recentSignals,
    pendingTrainingJobs: payload.pending_training_jobs ?? 0
  };
};

