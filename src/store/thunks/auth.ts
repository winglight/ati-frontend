import { createAsyncThunk } from '@reduxjs/toolkit';
import { fetchCurrentUser, login, AuthApiError, SessionUser } from '@services/authApi';
import type { RootState } from '@store/index';

const ACCESS_TOKEN_KEY = 'algoTrader.accessToken';
const AUTO_LOGIN_PREF_KEY = 'algoTrader.autoLogin';
const AUTO_LOGIN_CREDENTIALS_KEY = 'algoTrader.credentials';

interface StoredCredentials {
  username: string;
  password: string;
}

export const persistAccessToken = (token: string | null) => {
  if (typeof window === 'undefined') {
    return;
  }
  if (!token) {
    window.localStorage.removeItem(ACCESS_TOKEN_KEY);
    document.cookie = 'access_token=; Max-Age=0; path=/; samesite=lax';
    return;
  }
  const trimmed = token.trim();
  window.localStorage.setItem(ACCESS_TOKEN_KEY, trimmed);
  document.cookie = `access_token=${encodeURIComponent(trimmed)}; path=/; samesite=lax`;
};

export const readPersistedToken = (): string | null => {
  if (typeof window === 'undefined') {
    return null;
  }
  const token = window.localStorage.getItem(ACCESS_TOKEN_KEY);
  return token && token.length > 0 ? token : null;
};

export const persistAutoLoginPreference = (autoLogin: boolean) => {
  if (typeof window === 'undefined') {
    return;
  }
  if (!autoLogin) {
    window.localStorage.removeItem(AUTO_LOGIN_PREF_KEY);
    return;
  }
  window.localStorage.setItem(AUTO_LOGIN_PREF_KEY, 'true');
};

export const readAutoLoginPreference = (): boolean => {
  if (typeof window === 'undefined') {
    return false;
  }
  return window.localStorage.getItem(AUTO_LOGIN_PREF_KEY) === 'true';
};

export const persistStoredCredentials = (credentials: StoredCredentials | null) => {
  if (typeof window === 'undefined') {
    return;
  }
  if (!credentials) {
    window.localStorage.removeItem(AUTO_LOGIN_CREDENTIALS_KEY);
    return;
  }
  window.localStorage.setItem(AUTO_LOGIN_CREDENTIALS_KEY, JSON.stringify(credentials));
};

export const readStoredCredentials = (): StoredCredentials | null => {
  if (typeof window === 'undefined') {
    return null;
  }
  const rawValue = window.localStorage.getItem(AUTO_LOGIN_CREDENTIALS_KEY);
  if (!rawValue) {
    return null;
  }
  try {
    const parsed = JSON.parse(rawValue) as Partial<StoredCredentials>;
    if (!parsed.username || !parsed.password) {
      return null;
    }
    return { username: parsed.username, password: parsed.password };
  } catch (_error) {
    void _error;
    window.localStorage.removeItem(AUTO_LOGIN_CREDENTIALS_KEY);
    return null;
  }
};

interface AuthPayload {
  token: string;
  user: SessionUser;
}

export const loadStoredSession = createAsyncThunk<AuthPayload, void, { rejectValue: string }>(
  'auth/loadStoredSession',
  async (_, thunkAPI) => {
    const token = readPersistedToken();
    if (!token) {
      const autoLoginEnabled = readAutoLoginPreference();
      if (!autoLoginEnabled) {
        return thunkAPI.rejectWithValue('未检测到登录信息，请先登录。');
      }

      const storedCredentials = readStoredCredentials();
      if (!storedCredentials) {
        persistAutoLoginPreference(false);
        return thunkAPI.rejectWithValue('未检测到登录信息，请先登录。');
      }

      try {
        const { accessToken } = await login(storedCredentials.username, storedCredentials.password);
        persistAccessToken(accessToken);
        const user = await fetchCurrentUser(accessToken);
        return { token: accessToken, user };
      } catch (_error) {
        persistAccessToken(null);
        persistAutoLoginPreference(false);
        persistStoredCredentials(null);
        const message =
          _error instanceof AuthApiError ? _error.message : '读取登录状态失败，请重新登录。';
        return thunkAPI.rejectWithValue(message);
      }
    }
    try {
      const user = await fetchCurrentUser(token);
      return { token, user };
    } catch (_error) {
      const autoLoginEnabled = readAutoLoginPreference();
      if (autoLoginEnabled) {
        const storedCredentials = readStoredCredentials();
        if (storedCredentials) {
          try {
            // Attempt to refresh the session by logging in again with the saved credentials.
            const { accessToken } = await login(
              storedCredentials.username,
              storedCredentials.password,
            );
            persistAccessToken(accessToken);
            const user = await fetchCurrentUser(accessToken);
            return { token: accessToken, user };
          } catch (_retryError) {
            persistAccessToken(null);
            persistAutoLoginPreference(false);
            persistStoredCredentials(null);
            const retryMessage =
              _retryError instanceof AuthApiError
                ? _retryError.message
                : '读取登录状态失败，请重新登录。';
            return thunkAPI.rejectWithValue(retryMessage);
          }
        }
      }

      persistAccessToken(null);
      persistAutoLoginPreference(false);
      persistStoredCredentials(null);
      const message =
        _error instanceof AuthApiError ? _error.message : '读取登录状态失败，请重新登录。';
      return thunkAPI.rejectWithValue(message);
    }
  }
);

export const loginWithCredentials = createAsyncThunk<
  AuthPayload,
  { username: string; password: string; autoLogin: boolean },
  { rejectValue: string; state: RootState }
>(
  'auth/loginWithCredentials',
  async ({ username, password, autoLogin }, thunkAPI) => {
    try {
      const { accessToken } = await login(username, password);
      persistAccessToken(accessToken);
      const user = await fetchCurrentUser(accessToken);
      if (autoLogin) {
        persistAutoLoginPreference(true);
        persistStoredCredentials({ username, password });
      } else {
        persistAutoLoginPreference(false);
        persistStoredCredentials(null);
      }
      return { token: accessToken, user };
    } catch (error) {
      persistAccessToken(null);
      persistAutoLoginPreference(false);
      persistStoredCredentials(null);
      const message = error instanceof AuthApiError ? error.message : '登录失败，请稍后再试。';
      return thunkAPI.rejectWithValue(message);
    }
  }
);
