import { resolveRequestUrl } from './config.js';

export interface NewsLlmSymbolConfig {
  symbol: string;
  intervalSeconds: number;
  enabled: boolean;
}

export interface NewsLlmPromptTemplate {
  id: string;
  name: string;
  template: string;
  updatedAt?: string | null;
}

export interface NewsLlmConfig {
  symbols: NewsLlmSymbolConfig[];
  llm: {
    url: string;
    token: string;
    model: string;
    timeoutSeconds: number;
  };
  prompts: NewsLlmPromptTemplate[];
  activePromptId: string | null;
  marketData: Record<string, unknown> | null;
  positionData: Record<string, unknown> | null;
}

export interface NewsLlmConfigResponse {
  config: NewsLlmConfig;
  updatedAt?: string | null;
}

export interface NewsLlmTestResult {
  ok: boolean;
  message: string;
  responseSnippet?: string | null;
}

export interface NewsLlmLogEntry {
  id: string;
  status: string;
  createdAt: string;
  model?: string | null;
  durationMs?: number | null;
  promptId?: string | null;
  symbol?: string | null;
  request?: string | null;
  response?: string | null;
  error?: string | null;
}

export interface NewsLlmLogsResponse {
  items: NewsLlmLogEntry[];
  total: number;
}

export interface NewsLlmSignalEntry {
  id: string;
  symbol: string;
  rating: number;
  confidence: number;
  status: string;
  createdAt: string;
  strategy?: string | null;
  orderId?: string | null;
  executionStatus?: string | null;
  executionMessage?: string | null;
}

export interface NewsLlmSignalsResponse {
  items: NewsLlmSignalEntry[];
  total: number;
}

type RequestInitOverrides = Omit<RequestInit, 'headers'> & {
  headers?: HeadersInit;
};

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

const NEWS_LLM_BASE = '/news-service/news-llm';
const NEWS_LLM_LOGS_BASE = '/news-service/llm';

export const fetchNewsLlmConfig = async (token: string): Promise<NewsLlmConfigResponse> => {
  return requestJson<NewsLlmConfigResponse>(`${NEWS_LLM_BASE}/config`, token);
};

export const saveNewsLlmConfig = async (token: string, config: NewsLlmConfig): Promise<NewsLlmConfigResponse> => {
  return requestJson<NewsLlmConfigResponse>(`${NEWS_LLM_BASE}/config`, token, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ config })
  });
};

export const testNewsLlmPrompt = async (
  token: string,
  payload: { promptId: string | null; sample: string }
): Promise<NewsLlmTestResult> => {
  return requestJson<NewsLlmTestResult>(`${NEWS_LLM_BASE}/prompts/test`, token, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });
};

const buildQuery = (params: Record<string, string | number | null | undefined>): string => {
  const entries = Object.entries(params)
    .filter(([, value]) => value !== null && value !== undefined && value !== '')
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
  return entries.length ? `?${entries.join('&')}` : '';
};

export const fetchNewsLlmLogs = async (
  token: string,
  params: {
    status?: string | null;
    start?: string | null;
    end?: string | null;
    page?: number;
    pageSize?: number;
  }
): Promise<NewsLlmLogsResponse> => {
  const query = buildQuery({
    status: params.status ?? undefined,
    start: params.start ?? undefined,
    end: params.end ?? undefined,
    page: params.page ?? undefined,
    page_size: params.pageSize ?? undefined
  });
  return requestJson<NewsLlmLogsResponse>(`${NEWS_LLM_LOGS_BASE}/logs${query}`, token);
};

export const fetchNewsLlmSignals = async (
  token: string,
  params: {
    status?: string | null;
    executionStatus?: string | null;
    symbol?: string | null;
    page?: number;
    pageSize?: number;
  }
): Promise<NewsLlmSignalsResponse> => {
  const query = buildQuery({
    status: params.status ?? undefined,
    execution_status: params.executionStatus ?? undefined,
    symbol: params.symbol ?? undefined,
    page: params.page ?? undefined,
    page_size: params.pageSize ?? undefined
  });
  return requestJson<NewsLlmSignalsResponse>(`${NEWS_LLM_BASE}/signals${query}`, token);
};
