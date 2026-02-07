import { resolveRequestUrl } from './config.js';

export interface LoginResponse {
  accessToken: string;
  expiresIn: number;
}

export interface SessionUser {
  username: string;
  roles: string[];
  expiresAt: string;
}

const toCamel = (value: string): string => value.replace(/_([a-z])/g, (_, char) => char.toUpperCase());

const normalizeKeys = <T extends Record<string, unknown>>(payload: Record<string, unknown>): T => {
  return Object.fromEntries(Object.entries(payload).map(([key, value]) => [toCamel(key), value])) as T;
};

export class AuthApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthApiError';
  }
}

const withJson = async <T>(response: Response): Promise<T> => {
  const text = await response.text();
  if (!text) {
    throw new AuthApiError('Empty response from authentication service');
  }
  try {
    return JSON.parse(text) as T;
  } catch (_error) {
    throw new AuthApiError('Failed to parse authentication response');
  }
};

export const login = async (username: string, password: string): Promise<LoginResponse> => {
  const url = resolveRequestUrl('/login');
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ username, password })
  });

  if (!response.ok) {
    throw new AuthApiError('登录失败，请检查账号密码');
  }

  const data = await withJson<Record<string, unknown>>(response);
  const normalized = normalizeKeys<{ accessToken: string; expiresIn: number }>(data);
  if (!normalized.accessToken) {
    throw new AuthApiError('登录响应缺少访问令牌');
  }
  return normalized;
};

export const fetchCurrentUser = async (token: string): Promise<SessionUser> => {
  const url = resolveRequestUrl('/auth/me');
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });

  if (response.status === 401) {
    throw new AuthApiError('登录状态已过期，请重新登录');
  }
  if (!response.ok) {
    throw new AuthApiError('获取用户信息失败');
  }

  const data = await withJson<Record<string, unknown>>(response);
  const normalized = normalizeKeys<{ username: string; roles?: string[]; expiresAt?: string }>(data);
  return {
    username: normalized.username,
    roles: Array.isArray(normalized.roles) ? normalized.roles : [],
    expiresAt: normalized.expiresAt ?? new Date().toISOString()
  };
};
