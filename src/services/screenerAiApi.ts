import { resolveRequestUrl } from './config.js';

export interface ScreenerAiConfig {
  url: string;
  token: string;
  model: string;
  timeout_seconds: number;
  is_new_session: boolean;
  attach_filter_list_file: boolean;
}

export interface ScreenerAiConfigResponse {
  config: ScreenerAiConfig;
  updated_at?: string | null;
}

export interface ScreenerAiLogEntry {
  id: string;
  timestamp: string;
  status: string;
  duration_ms?: number | null;
  request_payload?: Record<string, unknown> | null;
  response_payload?: Record<string, unknown> | null;
  error?: string | null;
  model?: string | null;
}

export interface ScreenerAiLogsResponse {
  items: ScreenerAiLogEntry[];
  total: number;
  day?: string | null;
}

export interface ScreenerAiGeneratePayload {
  user_input: string;
  images: string[];
  current_profile?: Record<string, unknown> | null;
}

export interface ScreenerAiCondition {
  field: string;
  value: unknown;
}

export interface ScreenerAiConditionsResult {
  instrument?: string | null;
  location_code?: string | null;
  scan_code?: string | null;
  number_of_rows?: number | null;
  filters?: ScreenerAiCondition[] | null;
}

export interface ScreenerAiDeltaEvent {
  type: 'delta';
  content: string;
}

export interface ScreenerAiResultEvent {
  type: 'result';
  raw_text?: string | null;
  conditions?: ScreenerAiConditionsResult | null;
}

export interface ScreenerAiErrorEvent {
  type: 'error';
  message: string;
}

export type ScreenerAiStreamEvent =
  | ScreenerAiDeltaEvent
  | ScreenerAiResultEvent
  | ScreenerAiErrorEvent;

export class ScreenerAiApiError extends Error {
  constructor(message: string, public readonly status?: number) {
    super(message);
    this.name = 'ScreenerAiApiError';
  }
}

const requestJson = async <T>(
  path: string,
  token: string,
  init: RequestInit = {}
): Promise<T> => {
  const response = await fetch(resolveRequestUrl(path), {
    ...init,
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
      ...(init.headers ?? {})
    }
  });
  if (response.status === 401) {
    throw new ScreenerAiApiError('认证已过期，请重新登录', response.status);
  }
  if (!response.ok) {
    const text = await response.text();
    throw new ScreenerAiApiError(text || '请求失败', response.status);
  }
  return (await response.json()) as T;
};

export const fetchScreenerAiConfig = async (
  token: string
): Promise<ScreenerAiConfigResponse> => {
  return requestJson<ScreenerAiConfigResponse>('/strategies/screener/ai/config', token);
};

export const saveScreenerAiConfig = async (
  token: string,
  config: ScreenerAiConfig
): Promise<ScreenerAiConfigResponse> => {
  return requestJson<ScreenerAiConfigResponse>('/strategies/screener/ai/config', token, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ config })
  });
};

const buildQuery = (params: Record<string, string | number | null | undefined>): string => {
  const entries = Object.entries(params)
    .filter(([, value]) => value !== null && value !== undefined && value !== '')
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
  return entries.length ? `?${entries.join('&')}` : '';
};

export const fetchScreenerAiLogs = async (
  token: string,
  params: { limit?: number; day?: string | null } = {}
): Promise<ScreenerAiLogsResponse> => {
  const query = buildQuery({
    limit: params.limit ?? 10,
    day: params.day ?? undefined
  });
  return requestJson<ScreenerAiLogsResponse>(`/strategies/screener/ai/logs${query}`, token);
};

const parseStreamLine = (line: string): ScreenerAiStreamEvent | null => {
  try {
    const payload = JSON.parse(line) as Record<string, unknown>;
    const type = String(payload.type ?? '').trim().toLowerCase();
    if (type === 'delta') {
      const content = typeof payload.content === 'string' ? payload.content : '';
      return { type: 'delta', content };
    }
    if (type === 'result') {
      return {
        type: 'result',
        raw_text: typeof payload.raw_text === 'string' ? payload.raw_text : null,
        conditions:
          payload.conditions && typeof payload.conditions === 'object'
            ? (payload.conditions as ScreenerAiConditionsResult)
            : null
      };
    }
    if (type === 'error') {
      const message = typeof payload.message === 'string' ? payload.message : 'AI 生成失败';
      return { type: 'error', message };
    }
    return null;
  } catch {
    return null;
  }
};

export const streamScreenerAiGenerate = async (
  token: string,
  payload: ScreenerAiGeneratePayload,
  options: {
    onEvent: (event: ScreenerAiStreamEvent) => void;
  }
): Promise<void> => {
  const response = await fetch(resolveRequestUrl('/strategies/screener/ai/generate'), {
    method: 'POST',
    headers: {
      Accept: 'application/x-ndjson',
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  if (response.status === 401) {
    throw new ScreenerAiApiError('认证已过期，请重新登录', response.status);
  }
  if (!response.ok) {
    const text = await response.text();
    throw new ScreenerAiApiError(text || 'AI 生成请求失败', response.status);
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new ScreenerAiApiError('浏览器不支持流式响应');
  }

  const decoder = new TextDecoder('utf-8');
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    if (!value) {
      continue;
    }
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      const text = line.trim();
      if (!text) {
        continue;
      }
      const event = parseStreamLine(text);
      if (event) {
        options.onEvent(event);
      }
    }
  }

  const tail = buffer.trim();
  if (tail) {
    const event = parseStreamLine(tail);
    if (event) {
      options.onEvent(event);
    }
  }
};
