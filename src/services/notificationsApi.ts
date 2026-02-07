import type { NotificationItem } from '@features/dashboard/types';
import { normalizeTimestampToUtc } from '../utils/timezone.js';
import { resolveRequestUrl } from './config.js';

export interface NotificationRecordPayload {
  id?: string | number | null;
  message?: string;
  level?: string;
  category?: string;
  title?: string | null;
  created_at?: string;
  read?: boolean;
  read_at?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface NotificationListResponse {
  items?: NotificationRecordPayload[] | null;
  total?: number | null;
  unread?: number | null;
}

export interface NotificationListParams {
  limit?: number;
  unreadOnly?: boolean;
}

export interface NotificationListResult {
  items: NotificationItem[];
  total: number;
  unread: number;
}

export class NotificationsApiError extends Error {
  constructor(message: string, public readonly status?: number) {
    super(message);
    this.name = 'NotificationsApiError';
  }
}

const requestJson = async <T>(
  path: string,
  token: string,
  init: RequestInit = {}
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
    throw new NotificationsApiError('认证状态已失效，请重新登录', response.status);
  }
  if (!response.ok) {
    let detail = '获取通知列表失败';
    try {
      const payload = await response.json();
      if (payload && typeof payload === 'object' && typeof payload.detail === 'string') {
        detail = payload.detail;
      }
    } catch (_error) {
      // ignore parsing errors
    }
    throw new NotificationsApiError(detail, response.status);
  }

  try {
    return (await response.json()) as T;
  } catch (_error) {
    throw new NotificationsApiError('解析通知服务响应失败', response.status);
  }
};

const normalizeSeverity = (value: string | undefined): NotificationItem['severity'] => {
  const normalized = value?.trim().toLowerCase();
  if (normalized === 'error' || normalized === 'critical') {
    return 'error';
  }
  if (normalized === 'warning' || normalized === 'warn') {
    return 'warning';
  }
  return 'info';
};

const generateId = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `notification-${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

const coerceIdentifier = (value: unknown): string => {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed.length > 0) {
      return trimmed;
    }
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.trunc(value).toString();
  }
  if (typeof value === 'bigint') {
    return value.toString();
  }
  return generateId();
};

const extractString = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const lowered = trimmed.toLowerCase();
  if (lowered === 'undefined' || lowered === 'null') {
    return null;
  }
  return trimmed;
};

export const mapNotificationRecord = (payload: NotificationRecordPayload): NotificationItem => {
  const metadata = (payload.metadata ?? {}) as Record<string, unknown>;
  const timestamp = normalizeTimestampToUtc(payload.created_at) ?? payload.created_at ?? new Date().toISOString();
  const acknowledgedAt = payload.read_at ? normalizeTimestampToUtc(payload.read_at) ?? payload.read_at : null;
  const channel =
    extractString(metadata.channel) ??
    extractString(metadata.transport) ??
    extractString(metadata.medium) ??
    extractString((payload as Record<string, unknown>).channel);
  const status =
    extractString(metadata.status) ??
    extractString(metadata.state) ??
    extractString((payload as Record<string, unknown>).status);
  const event =
    extractString(metadata.event) ??
    extractString(metadata.category) ??
    extractString(payload.category ?? undefined);
  const errorDetail =
    extractString(metadata.error) ??
    extractString(metadata.reason) ??
    extractString(metadata.detail) ??
    extractString((payload as Record<string, unknown>).error);
  const message =
    extractString(payload.message) ??
    extractString(metadata.message) ??
    extractString(metadata.summary) ??
    extractString(metadata.detail) ??
    extractString(metadata.reason) ??
    '—';
  const title =
    extractString(payload.title) ??
    extractString(payload.category) ??
    extractString(metadata.title) ??
    extractString(metadata.category) ??
    '系统通知';

  return {
    id: coerceIdentifier(payload.id),
    severity: normalizeSeverity(payload.level),
    title,
    message,
    timestamp,
    read: Boolean(payload.read),
    acknowledgedAt,
    channel,
    status,
    event,
    errorDetail
  };
};

export const listNotifications = async (
  token: string,
  params: NotificationListParams = {}
): Promise<NotificationListResult> => {
  const searchParams = new URLSearchParams();
  if (params.limit) {
    searchParams.set('limit', params.limit.toString());
  }
  if (params.unreadOnly) {
    searchParams.set('unread_only', 'true');
  }

  const query = searchParams.toString();
  const endpoint = query ? `/notifications?${query}` : '/notifications';

  const payload = await requestJson<NotificationListResponse>(endpoint, token, {
    method: 'GET'
  });

  const items = Array.isArray(payload.items) ? payload.items.map(mapNotificationRecord) : [];
  return {
    items,
    total: typeof payload.total === 'number' ? payload.total : items.length,
    unread: typeof payload.unread === 'number' ? payload.unread : items.filter((item) => !item.read).length
  };
};

export const acknowledgeNotification = async (token: string, id: string): Promise<NotificationItem> => {
  const payload = await requestJson<NotificationRecordPayload>(
    `/notifications/${id}/ack`,
    token,
    { method: 'POST' }
  );
  return mapNotificationRecord(payload);
};

export const acknowledgeAllNotifications = async (token: string): Promise<number> => {
  const payload = await requestJson<{ updated?: number }>(
    '/notifications/ack-all',
    token,
    { method: 'POST' }
  );
  return typeof payload.updated === 'number' ? payload.updated : 0;
};

export const deleteNotification = async (token: string, id: string): Promise<void> => {
  const url = resolveRequestUrl(`/notifications/${id}`);
  const headers: HeadersInit = {
    Accept: 'application/json',
    Authorization: `Bearer ${token}`
  };
  const response = await fetch(url, { method: 'DELETE', headers });
  if (response.status === 401) {
    throw new NotificationsApiError('认证状态已失效，请重新登录', response.status);
  }
  if (!response.ok && response.status !== 404) {
    throw new NotificationsApiError('删除通知失败', response.status);
  }
};
