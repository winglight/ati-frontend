import { resolveRequestUrl } from './config.js';
import { subscribeWebSocket, type WebSocketSubscription } from './websocketHub';

export type ModelOpsJobType = 'training' | 'optimize';

export interface FusionConfigInput {
  enableNewsFeatures: boolean;
  weights?: Record<string, number> | null;
  newsModelVersion?: string | null;
}

export interface CreateTrainingJobPayload {
  symbol: string;
  timeframe: string;
  startAt: string;
  endAt: string;
  features: string[];
  resourceTemplate?: string | null;
  fusion: FusionConfigInput;
}

export interface JobAcceptedPayload {
  jobId: string;
  status: 'accepted';
}

export interface JobDetail {
  symbol?: string;
  timeframe?: string;
  startAt?: string;
  endAt?: string;
  features?: string[];
  resourceTemplate?: string | null;
  fusion?: FusionConfigInput;
}

export interface JobStatusPayload {
  jobId: string;
  status: string;
  jobType: ModelOpsJobType;
  detail?: JobDetail | null;
}

export interface ModelVersion {
  version: string;
  metrics: Record<string, number>;
  jobId: string;
  metadata?: Record<string, unknown> | null;
}

export interface NewsModelSummary {
  id: string;
  label: string;
  latencyMs?: number | null;
}

export interface ActivateModelPayload {
  reason?: string;
}

interface TrainingJobRequestPayload {
  symbol: string;
  timeframe: string;
  start_at: string;
  end_at: string;
  features: string[];
  resource_template?: string | null;
  fusion: Record<string, unknown>;
}

interface JobAcceptedResponsePayload {
  job_id?: string;
  status?: string;
}

interface JobStatusResponsePayload {
  job_id?: string;
  status?: string;
  job_type?: string;
  detail?: Record<string, unknown> | null;
}

interface ModelVersionPayload {
  version?: string;
  metrics?: Record<string, unknown> | null;
  job_id?: string;
  metadata?: Record<string, unknown> | null;
}

interface NewsModelPayload {
  id?: string;
  label?: string;
  latency_ms?: number | string | null;
}

interface ActivateModelResponsePayload {
  status?: string;
}

const requestJson = async <T>(
  path: string,
  token: string,
  init: RequestInit = {},
  options: { errorMessage?: string } = {}
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
    let detail = options.errorMessage ?? 'AI Model Ops 请求失败';
    try {
      const payload = await response.json();
      if (payload && typeof payload === 'object' && typeof payload.detail === 'string') {
        detail = payload.detail;
      }
    } catch (_error) {
      // ignore parse errors
    }
    throw new Error(detail);
  }

  if (response.status === 204) {
    return {} as T;
  }

  return (await response.json()) as T;
};

const toBoolean = (value: unknown): boolean => value === true;

const toNumberRecord = (value: unknown): Record<string, number> => {
  if (!value || typeof value !== 'object') {
    return {};
  }
  const record: Record<string, number> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (typeof raw === 'number' && Number.isFinite(raw)) {
      record[key] = raw;
    } else if (typeof raw === 'string') {
      const parsed = Number.parseFloat(raw);
      if (Number.isFinite(parsed)) {
        record[key] = parsed;
      }
    }
  }
  return record;
};

const toStringArray = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value.filter((entry): entry is string => typeof entry === 'string' && entry.length > 0);
  }
  return [];
};

const mapFusionConfig = (value: unknown): FusionConfigInput | undefined => {
  if (!value || typeof value !== 'object') {
    return undefined;
  }
  const payload = value as Record<string, unknown>;
  return {
    enableNewsFeatures: toBoolean(payload['enable_news_features']) || Boolean(payload['enableNewsFeatures']),
    weights: toNumberRecord(payload['weights']),
    newsModelVersion:
      typeof payload['news_model_version'] === 'string'
        ? (payload['news_model_version'] as string)
        : typeof payload['newsModelVersion'] === 'string'
          ? (payload['newsModelVersion'] as string)
          : undefined
  };
};

const mapJobDetail = (value: Record<string, unknown> | null | undefined): JobDetail | undefined => {
  if (!value) {
    return undefined;
  }
  const detail: JobDetail = {
    symbol: typeof value['symbol'] === 'string' ? value['symbol'] : undefined,
    timeframe: typeof value['timeframe'] === 'string' ? value['timeframe'] : undefined,
    startAt: typeof value['start_at'] === 'string' ? value['start_at'] : (typeof value['startAt'] === 'string' ? value['startAt'] : undefined),
    endAt: typeof value['end_at'] === 'string' ? value['end_at'] : (typeof value['endAt'] === 'string' ? value['endAt'] : undefined),
    features: toStringArray(value['features']),
    resourceTemplate:
      typeof value['resource_template'] === 'string'
        ? value['resource_template']
        : typeof value['resourceTemplate'] === 'string'
          ? value['resourceTemplate']
          : undefined,
    fusion: mapFusionConfig(value['fusion'])
  };
  return detail;
};

const mapJobStatusPayload = (payload: JobStatusResponsePayload): JobStatusPayload => {
  const jobId = typeof payload.job_id === 'string' && payload.job_id
    ? payload.job_id
    : typeof payload['jobId' as keyof JobStatusResponsePayload] === 'string'
      ? (payload as unknown as { jobId?: string }).jobId ?? ''
      : '';
  const jobTypeRaw = typeof payload.job_type === 'string' ? payload.job_type : '';
  const jobType: ModelOpsJobType = jobTypeRaw === 'optimize' ? 'optimize' : 'training';
  return {
    jobId,
    status: typeof payload.status === 'string' ? payload.status : 'pending',
    jobType,
    detail: mapJobDetail(payload.detail ?? undefined) ?? null
  };
};

const mapModelVersionPayload = (payload: ModelVersionPayload): ModelVersion => {
  return {
    version: typeof payload.version === 'string' ? payload.version : 'unknown',
    metrics: toNumberRecord(payload.metrics ?? {}),
    jobId: typeof payload.job_id === 'string' ? payload.job_id : '',
    metadata: payload.metadata ?? null
  };
};

const mapNewsModelPayload = (payload: NewsModelPayload): NewsModelSummary | null => {
  const id = typeof payload.id === 'string' ? payload.id : undefined;
  const label = typeof payload.label === 'string' ? payload.label : undefined;
  if (!id || !label) {
    return null;
  }
  const latencyRaw = payload.latency_ms ?? (payload as Record<string, unknown>)['latencyMs'];
  let latency: number | null = null;
  if (typeof latencyRaw === 'number' && Number.isFinite(latencyRaw)) {
    latency = latencyRaw;
  } else if (typeof latencyRaw === 'string') {
    const parsed = Number.parseFloat(latencyRaw);
    latency = Number.isFinite(parsed) ? parsed : null;
  }
  return { id, label, latencyMs: latency };
};

const normalizeNewsModelList = (value: unknown): NewsModelSummary[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  const models: NewsModelSummary[] = [];
  for (const entry of value) {
    if (entry && typeof entry === 'object') {
      const mapped = mapNewsModelPayload(entry as NewsModelPayload);
      if (mapped) {
        models.push(mapped);
      }
    }
  }
  return models;
};

export const createTrainingJob = async (
  payload: CreateTrainingJobPayload,
  token: string
): Promise<JobAcceptedPayload> => {
  const requestPayload: TrainingJobRequestPayload = {
    symbol: payload.symbol,
    timeframe: payload.timeframe,
    start_at: payload.startAt,
    end_at: payload.endAt,
    features: payload.features,
    resource_template: payload.resourceTemplate ?? undefined,
    fusion: {
      enable_news_features: payload.fusion.enableNewsFeatures,
      ...(payload.fusion.weights ? { weights: payload.fusion.weights } : {}),
      ...(payload.fusion.newsModelVersion
        ? { news_model_version: payload.fusion.newsModelVersion }
        : {})
    }
  };

  const response = await requestJson<JobAcceptedResponsePayload>(
    '/ai-model-ops/train_jobs',
    token,
    {
      method: 'POST',
      body: JSON.stringify(requestPayload)
    },
    { errorMessage: '创建训练任务失败' }
  );

  return {
    jobId: typeof response.job_id === 'string' && response.job_id ? response.job_id : 'unknown',
    status: response.status === 'accepted' ? 'accepted' : 'accepted'
  };
};

export const fetchJobStatus = async (
  jobId: string,
  token: string
): Promise<JobStatusPayload> => {
  const response = await requestJson<JobStatusResponsePayload>(
    `/ai-model-ops/jobs/${encodeURIComponent(jobId)}`,
    token,
    {},
    { errorMessage: '查询任务状态失败' }
  );
  return mapJobStatusPayload(response);
};

export const listModelVersions = async (
  modelName: string,
  token: string
): Promise<ModelVersion[]> => {
  const response = await requestJson<{ versions?: ModelVersionPayload[] | null }>(
    `/ai-model-ops/models/${encodeURIComponent(modelName)}/versions`,
    token,
    {},
    { errorMessage: '获取模型版本列表失败' }
  );
  const entries = Array.isArray(response.versions) ? response.versions : [];
  return entries.map(mapModelVersionPayload);
};

export const listAvailableNewsModels = async (token: string): Promise<NewsModelSummary[]> => {
  try {
    const response = await requestJson<{ models?: NewsModelPayload[] | null }>(
      '/ai-model-ops/news-models',
      token,
      {},
      { errorMessage: '获取新闻子模型列表失败' }
    );
    return normalizeNewsModelList(response.models ?? []);
  } catch (_error) {
    console.warn('[AIModelOps] 获取新闻子模型列表失败，将返回空列表', _error);
    return [];
  }
};

const postModelVersionAction = async (
  action: 'activate' | 'rollback',
  version: string,
  token: string,
  payload: ActivateModelPayload = {},
  modelName?: string
): Promise<void> => {
  const body = JSON.stringify({ reason: payload.reason ?? null });
  const errorMessage = action === 'activate' ? '激活模型版本失败' : '模型回滚失败';
  try {
    await requestJson<ActivateModelResponsePayload>(
      `/ai-model-ops/models/${encodeURIComponent(version)}/${action}`,
      token,
      {
        method: 'POST',
        body
      },
      { errorMessage }
    );
    return;
  } catch (error) {
    if (!modelName) {
      throw error;
    }
  }
  await requestJson<ActivateModelResponsePayload>(
    `/ai-model-ops/models/${encodeURIComponent(modelName)}/${encodeURIComponent(version)}/${action}`,
    token,
    {
      method: 'POST',
      body
    },
    { errorMessage }
  );
};

export const activateModelVersion = async (
  version: string,
  token: string,
  payload: ActivateModelPayload = {},
  modelName?: string
): Promise<void> => {
  await postModelVersionAction('activate', version, token, payload, modelName);
};

export const rollbackModelVersion = async (
  version: string,
  token: string,
  payload: ActivateModelPayload = {},
  modelName?: string
): Promise<void> => {
  await postModelVersionAction('rollback', version, token, payload, modelName);
};

export interface ModelOpsProgressEvent {
  channel: string;
  jobId: string;
  stage: string;
  status: string;
  jobType: ModelOpsJobType;
  receivedAt: string;
  [key: string]: unknown;
}

export interface ModelOpsResultEvent {
  channel: string;
  jobId: string;
  status: string;
  jobType: ModelOpsJobType;
  result?: Record<string, unknown> | null;
  receivedAt: string;
}

interface RawEventEnvelope {
  channel?: string;
  payload?: unknown;
  event?: string;
  type?: string;
  data?: unknown;
}

const toEventChannel = (value: unknown): string => (typeof value === 'string' ? value : '');

const ensureReceivedAt = (): string => new Date().toISOString();

const toRecord = (value: unknown): Record<string, unknown> | null => {
  if (!value || typeof value !== 'object') {
    return null;
  }
  return { ...(value as Record<string, unknown>) };
};

const mapProgressEvent = (channel: string, payload: Record<string, unknown>): ModelOpsProgressEvent | null => {
  const jobId = typeof payload['job_id'] === 'string' ? payload['job_id'] : (typeof payload['jobId'] === 'string' ? payload['jobId'] : null);
  const stage = typeof payload['stage'] === 'string' ? payload['stage'] : 'unknown';
  const status = typeof payload['status'] === 'string' ? payload['status'] : 'pending';
  const jobTypeRaw = typeof payload['job_type'] === 'string' ? payload['job_type'] : (typeof payload['jobType'] === 'string' ? payload['jobType'] : 'training');
  if (!jobId) {
    return null;
  }
  const event: ModelOpsProgressEvent = {
    channel,
    jobId,
    stage,
    status,
    jobType: jobTypeRaw === 'optimize' ? 'optimize' : 'training',
    receivedAt: ensureReceivedAt()
  };
  for (const [key, value] of Object.entries(payload)) {
    if (!(key in event)) {
      event[key] = value;
    }
  }
  return event;
};

const mapResultEvent = (channel: string, payload: Record<string, unknown>): ModelOpsResultEvent | null => {
  const jobId = typeof payload['job_id'] === 'string' ? payload['job_id'] : (typeof payload['jobId'] === 'string' ? payload['jobId'] : null);
  const status = typeof payload['status'] === 'string' ? payload['status'] : 'unknown';
  const jobTypeRaw = typeof payload['job_type'] === 'string' ? payload['job_type'] : (typeof payload['jobType'] === 'string' ? payload['jobType'] : 'training');
  if (!jobId) {
    return null;
  }
  return {
    channel,
    jobId,
    status,
    jobType: jobTypeRaw === 'optimize' ? 'optimize' : 'training',
    result: toRecord(payload['result']) ?? null,
    receivedAt: ensureReceivedAt()
  };
};

const parseMessage = (raw: string): RawEventEnvelope | null => {
  try {
    const data = JSON.parse(raw) as RawEventEnvelope;
    return data;
  } catch (_error) {
    console.warn('[AIModelOps] 无法解析事件消息', _error);
    return null;
  }
};

interface SubscribeToModelOpsEventsOptions {
  tokenProvider: () => string | null;
  path?: string;
  onProgress?: (event: ModelOpsProgressEvent) => void;
  onResult?: (event: ModelOpsResultEvent) => void;
  onError?: (event: Event) => void;
  onClose?: (event: CloseEvent) => void;
  onOpen?: (event: Event) => void;
}

export const subscribeToModelOpsEvents = (
  options: SubscribeToModelOpsEventsOptions
): WebSocketSubscription => {
  const path = options.path ?? '/ws/events';
  const topics = ['ai_model_ops.progress', 'ai_model_ops.result'];
  let disposed = false;
  const managedSubscription = subscribeWebSocket({
    name: 'ai-model-ops',
    path,
    tokenProvider: options.tokenProvider,
    onOpen: (event) => {
      sendSubscribe();
      options.onOpen?.(event);
    },
    onClose: options.onClose,
    onError: options.onError,
    onMessage: (message) => {
      const parsed = parseMessage(message);
      if (!parsed) {
        return;
      }
      const channel = toEventChannel(parsed.channel ?? parsed.event ?? parsed.type);
      const payload = toRecord(parsed.payload ?? parsed.data ?? parsed);
      if (!payload || !channel) {
        return;
      }
      if (channel.includes('progress')) {
        const event = mapProgressEvent(channel, payload);
        if (event) {
          options.onProgress?.(event);
        }
      } else if (channel.includes('result')) {
        const event = mapResultEvent(channel, payload);
        if (event) {
          options.onResult?.(event);
        }
      }
    }
  });

  function sendSubscribe() {
    if (disposed) {
      return false;
    }
    if (!managedSubscription.isOpen()) {
      return false;
    }
    return managedSubscription.send({ action: 'subscribe', topics });
  }

  function sendUnsubscribe() {
    if (!managedSubscription.isOpen()) {
      return false;
    }
    return managedSubscription.send({ action: 'unsubscribe', topics });
  }

  // Attempt to subscribe immediately if the connection is already open.
  sendSubscribe();

  return {
    send: managedSubscription.send,
    isOpen: managedSubscription.isOpen,
    dispose: () => {
      if (disposed) {
        return;
      }
      disposed = true;
      sendUnsubscribe();
      managedSubscription.dispose();
    }
  };
};
