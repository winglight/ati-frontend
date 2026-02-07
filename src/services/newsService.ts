import { resolveRequestUrl } from './config.js';
import { subscribeWebSocket, type WebSocketSubscription } from './websocketHub';

export interface NewsArticle {
  id: string;
  source: string;
  title: string;
  summary: string;
  symbols: string[];
  sentiment: number;
  publishedAt: string;
}

export interface NewsQueryFilters {
  symbol?: string;
  limit?: number;
}

export interface NewsQueryResult {
  items: NewsArticle[];
  total: number;
}

export interface SentimentSignal {
  id: string;
  text: string;
  probability: number;
  rating: number;
  symbols: string[];
  modelVersion: string;
  createdAt: string;
  publishedAt?: string | null;
}

export interface SubmitTrainingJobPayload {
  dataset: string;
  notes?: string | null;
  hyperparameters?: Record<string, unknown> | null;
}

export interface TrainingJobAccepted {
  jobId: string;
  status: 'accepted';
}

export interface ModelMetadata {
  version: string;
  description?: string | null;
  registeredAt: string;
  metrics: Record<string, number>;
}

export type NewsEventType = 'training_job' | 'prediction' | 'model_activation' | 'unknown';

export interface NewsServiceEvent {
  channel: string;
  type: NewsEventType;
  receivedAt: string;
  payload: Record<string, unknown>;
}

interface RequestOptions {
  errorMessage?: string;
}

const requestJson = async <T>(
  path: string,
  token: string,
  init: RequestInit = {},
  options: RequestOptions = {}
): Promise<T> => {
  const url = resolveRequestUrl(path);
  const headers: HeadersInit = {
    Accept: 'application/json',
    Authorization: `Bearer ${token}`,
    ...(init.headers ?? {})
  };

  if (init.body && !(headers as Record<string, string>)['Content-Type']) {
    (headers as Record<string, string>)['Content-Type'] = 'application/json';
  }

  const response = await fetch(url, { ...init, headers });

  if (response.status === 401) {
    throw new Error('认证状态已失效，请重新登录');
  }

  if (!response.ok) {
    let detail = options.errorMessage ?? '新闻情绪服务请求失败';
    try {
      const payload = await response.json();
      if (payload && typeof payload === 'object' && typeof payload.detail === 'string') {
        detail = payload.detail;
      }
    } catch (_error) {
      // ignore parsing failures
    }
    throw new Error(detail);
  }

  if (response.status === 204) {
    return {} as T;
  }

  return (await response.json()) as T;
};

const toNumber = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return null;
};

const toStringArray = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((entry): entry is string => typeof entry === 'string' && entry.length > 0);
};

const mapNewsArticle = (payload: Record<string, unknown>): NewsArticle | null => {
  const rawId = payload.id;
  const id = typeof rawId === 'string' ? rawId : typeof rawId === 'number' ? String(rawId) : null;
  const title = typeof payload.title === 'string' ? payload.title : null;
  const summary = typeof payload.summary === 'string' ? payload.summary : '';
  const source = typeof payload.source === 'string' ? payload.source : '未知来源';
  const sentiment = toNumber(payload.sentiment) ?? 0;
  const publishedAtRaw = typeof payload.published_at === 'string'
    ? payload.published_at
    : typeof payload.publishedAt === 'string'
      ? payload.publishedAt
      : null;

  if (!id || !title || !publishedAtRaw) {
    return null;
  }

  return {
    id,
    title,
    summary,
    source,
    sentiment,
    publishedAt: publishedAtRaw,
    symbols: toStringArray(payload.symbols)
  };
};

const mapSignal = (payload: Record<string, unknown>): SentimentSignal | null => {
  const id = typeof payload.id === 'string' ? payload.id : null;
  const text = typeof payload.text === 'string' ? payload.text : '';
  const probability = toNumber(payload.probability);
  const rating = toNumber(payload.rating);
  const modelVersion = typeof payload.model_version === 'string'
    ? payload.model_version
    : typeof payload.modelVersion === 'string'
      ? payload.modelVersion
      : null;
  const createdAt = typeof payload.created_at === 'string'
    ? payload.created_at
    : typeof payload.createdAt === 'string'
      ? payload.createdAt
      : null;
  if (!id || probability === null || rating === null || !modelVersion || !createdAt) {
    return null;
  }
  const publishedAt = typeof payload.published_at === 'string'
    ? payload.published_at
    : typeof payload.publishedAt === 'string'
      ? payload.publishedAt
      : null;
  return {
    id,
    text,
    probability,
    rating: Math.round(rating),
    symbols: toStringArray(payload.symbols),
    modelVersion,
    createdAt,
    publishedAt
  };
};

const mapModelMetadata = (payload: Record<string, unknown>): ModelMetadata | null => {
  const version = typeof payload.version === 'string' ? payload.version : null;
  const registeredAt = typeof payload.registered_at === 'string'
    ? payload.registered_at
    : typeof payload.registeredAt === 'string'
      ? payload.registeredAt
      : null;
  if (!version || !registeredAt) {
    return null;
  }
  const metrics: Record<string, number> = {};
  if (payload.metrics && typeof payload.metrics === 'object') {
    for (const [key, value] of Object.entries(payload.metrics as Record<string, unknown>)) {
      const numeric = toNumber(value);
      if (numeric !== null) {
        metrics[key] = numeric;
      }
    }
  }
  const description = typeof payload.description === 'string' ? payload.description : null;
  return { version, registeredAt, description, metrics };
};

const ensureFilters = (filters: NewsQueryFilters | undefined): Required<NewsQueryFilters> => {
  return {
    symbol: filters?.symbol ?? '',
    limit: typeof filters?.limit === 'number' && Number.isFinite(filters.limit) ? filters.limit : 20
  };
};

export const fetchNews = async (
  filters: NewsQueryFilters,
  token: string
): Promise<NewsQueryResult> => {
  const normalized = ensureFilters(filters);
  const params = new URLSearchParams();
  if (normalized.symbol) {
    params.set('symbol', normalized.symbol);
  }
  if (normalized.limit) {
    params.set('limit', String(normalized.limit));
  }
  const path = params.toString() ? `/news-service/news?${params.toString()}` : '/news-service/news';
  const response = await requestJson<{ items?: unknown; total?: unknown }>(
    path,
    token,
    {},
    { errorMessage: '获取新闻列表失败' }
  );
  const rawItems = Array.isArray(response.items) ? response.items : [];
  const items: NewsArticle[] = [];
  for (const entry of rawItems) {
    if (entry && typeof entry === 'object') {
      const mapped = mapNewsArticle(entry as Record<string, unknown>);
      if (mapped) {
        items.push(mapped);
      }
    }
  }
  const total = typeof response.total === 'number' ? response.total : items.length;
  return { items, total };
};

export const fetchRecentSignals = async (
  token: string,
  limit?: number
): Promise<SentimentSignal[]> => {
  const params = new URLSearchParams();
  if (typeof limit === 'number' && Number.isFinite(limit)) {
    params.set('limit', String(limit));
  }
  const response = await requestJson<{ signals?: unknown }>(
    params.size > 0 ? `/news-service/news/signals?${params.toString()}` : '/news-service/news/signals',
    token,
    {},
    { errorMessage: '获取情绪信号失败' }
  );
  const payload = Array.isArray(response.signals) ? response.signals : [];
  const signals: SentimentSignal[] = [];
  for (const entry of payload) {
    if (entry && typeof entry === 'object') {
      const mapped = mapSignal(entry as Record<string, unknown>);
      if (mapped) {
        signals.push(mapped);
      }
    }
  }
  return signals;
};

export const submitTrainingJob = async (
  payload: SubmitTrainingJobPayload,
  token: string
): Promise<TrainingJobAccepted> => {
  const response = await requestJson<{ job_id?: unknown; status?: unknown }>(
    '/news-service/news/train_jobs',
    token,
    {
      method: 'POST',
      body: JSON.stringify({
        dataset: payload.dataset,
        notes: payload.notes ?? null,
        hyperparameters: payload.hyperparameters ?? null
      })
    },
    { errorMessage: '提交训练任务失败' }
  );
  const jobId = typeof response.job_id === 'string' ? response.job_id : 'unknown';
  return { jobId, status: response.status === 'accepted' ? 'accepted' : 'accepted' };
};

export const fetchModelMetadata = async (
  version: string,
  token: string
): Promise<ModelMetadata | null> => {
  const response = await requestJson<Record<string, unknown>>(
    `/news-service/news/models/${encodeURIComponent(version)}`,
    token,
    {},
    { errorMessage: '获取模型版本信息失败' }
  );
  const mapped = mapModelMetadata(response);
  return mapped;
};

export const activateModelVersion = async (
  version: string,
  token: string
): Promise<void> => {
  await requestJson(
    `/news-service/news/models/${encodeURIComponent(version)}/activate`,
    token,
    {
      method: 'POST'
    },
    { errorMessage: '激活模型版本失败' }
  );
};

export const newsServiceDependencies = {
  subscribeWebSocket
};

const DEFAULT_NEWS_TOPICS = ['news_service.signals', 'news_service.model.activated'] as const;

const normalizeTopics = (topics: string[] | undefined): string[] => {
  const base: string[] = [...DEFAULT_NEWS_TOPICS];
  if (Array.isArray(topics)) {
    for (const topic of topics) {
      if (typeof topic !== 'string') {
        continue;
      }
      const trimmed = topic.trim();
      if (!trimmed) {
        continue;
      }
      base.push(trimmed);
    }
  }
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const topic of base) {
    if (seen.has(topic)) {
      continue;
    }
    seen.add(topic);
    normalized.push(topic);
  }
  return normalized;
};

interface SubscribeToNewsEventsOptions {
  tokenProvider: () => string | null;
  path?: string;
  onEvent?: (event: NewsServiceEvent) => void;
  onError?: (event: Event) => void;
  onClose?: (event: CloseEvent) => void;
  onOpen?: (event: Event) => void;
  topics?: string[];
}

interface RawEventEnvelope {
  channel?: unknown;
  payload?: unknown;
  data?: unknown;
  event?: unknown;
  type?: unknown;
}

const ensureEventType = (payload: Record<string, unknown>): NewsEventType => {
  const rawType = typeof payload.type === 'string' ? payload.type : typeof payload.event === 'string' ? payload.event : '';
  switch (rawType) {
    case 'training_job':
    case 'prediction':
    case 'model_activation':
      return rawType;
    default:
      return 'unknown';
  }
};

const parseEventMessage = (raw: string): RawEventEnvelope | null => {
  try {
    return JSON.parse(raw) as RawEventEnvelope;
  } catch (_error) {
    console.warn('[NewsService] 无法解析事件消息', _error);
    return null;
  }
};

const ensureChannel = (value: unknown): string => {
  if (typeof value === 'string') {
    return value;
  }
  return '';
};

const toRecord = (value: unknown): Record<string, unknown> | null => {
  if (!value || typeof value !== 'object') {
    return null;
  }
  return { ...(value as Record<string, unknown>) };
};

const ensureReceivedAt = (): string => new Date().toISOString();

export const subscribeToNewsEvents = (
  options: SubscribeToNewsEventsOptions
): WebSocketSubscription => {
  const path = options.path ?? '/ws/news-service';
  const topics = normalizeTopics(options.topics);
  let subscribed = false;
  const subscription = newsServiceDependencies.subscribeWebSocket({
    name: 'news-service',
    path,
    tokenProvider: options.tokenProvider,
    onOpen: (event) => {
      subscribed = false;
      sendSubscribe();
      options.onOpen?.(event);
    },
    onClose: (event) => {
      subscribed = false;
      options.onClose?.(event);
    },
    onError: options.onError,
    onMessage: (message) => {
      const parsed = parseEventMessage(message);
      if (!parsed) {
        return;
      }
      const channel = ensureChannel(parsed.channel ?? parsed.event ?? parsed.type);
      const payload = toRecord(parsed.payload ?? parsed.data ?? parsed);
      if (!channel || !payload) {
        return;
      }
      const event: NewsServiceEvent = {
        channel,
        type: ensureEventType(payload),
        receivedAt: ensureReceivedAt(),
        payload
      };
      options.onEvent?.(event);
    }
  });

  function sendSubscribe() {
    if (!topics.length) {
      return;
    }
    const payload = { action: 'subscribe', topics };
    const sent = subscription.send(payload);
    if (!sent) {
      console.warn('[NewsService] 发送订阅请求失败', payload);
      return;
    }
    subscribed = true;
  }

  function sendUnsubscribe() {
    if (!topics.length || !subscribed || !subscription.isOpen()) {
      return;
    }
    const payload = { action: 'unsubscribe', topics };
    const sent = subscription.send(payload);
    if (!sent) {
      console.warn('[NewsService] 发送取消订阅请求失败', payload);
      return;
    }
    subscribed = false;
  }
  return {
    send: subscription.send,
    isOpen: subscription.isOpen,
    dispose: () => {
      sendUnsubscribe();
      subscription.dispose();
    }
  };
};
