import { resolveRequestUrl } from './config.js';

export interface ChannelPreferencePayload {
  chrome: boolean;
  telegram: boolean;
  email: boolean;
}

export interface TelegramSettingsPayload {
  enabled: boolean;
  botToken: string;
  chatId: string;
}

export interface EmailSettingsPayload {
  enabled: boolean;
  address: string;
}

export interface ReminderSettingsPayload {
  startTime: string;
  endTime: string;
  browser: boolean;
  telegram: boolean;
}

export interface NotificationSettingsPayload {
  telegram: TelegramSettingsPayload;
  email: EmailSettingsPayload;
  reminder: ReminderSettingsPayload;
  modules: Record<string, ChannelPreferencePayload>;
}

export interface NotificationSettingsResponse extends NotificationSettingsPayload {
  moduleDefinitions: Record<string, string>;
}

export class NotificationSettingsApiError extends Error {
  constructor(message: string, public readonly status?: number) {
    super(message);
    this.name = 'NotificationSettingsApiError';
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
    throw new NotificationSettingsApiError('认证状态已失效，请重新登录', response.status);
  }
  if (!response.ok) {
    let detail = '获取通知设置失败';
    try {
      const payload = await response.json();
      if (payload && typeof payload === 'object' && typeof payload.detail === 'string') {
        detail = payload.detail;
      }
    } catch (_error) {
      // ignore parsing errors
    }
    throw new NotificationSettingsApiError(detail, response.status);
  }

  try {
    return (await response.json()) as T;
  } catch (_error) {
    throw new NotificationSettingsApiError('解析通知设置响应失败', response.status);
  }
};

export const fetchNotificationSettings = async (
  token: string
): Promise<NotificationSettingsResponse> => {
  return requestJson<NotificationSettingsResponse>('/notifications/settings', token, {
    method: 'GET'
  });
};

export const updateNotificationSettings = async (
  token: string,
  payload: NotificationSettingsPayload
): Promise<NotificationSettingsResponse> => {
  return requestJson<NotificationSettingsResponse>('/notifications/settings', token, {
    method: 'PUT',
    body: JSON.stringify(payload)
  });
};
