import { createAsyncThunk } from '@reduxjs/toolkit';
import type { RootState } from '@store/index';
import {
  fetchNotificationSettings as fetchNotificationSettingsRequest,
  updateNotificationSettings,
  NotificationSettingsApiError,
  type NotificationSettingsPayload,
  type NotificationSettingsResponse
} from '@services/notificationSettingsApi';

const requireToken = (state: RootState): string => {
  const token = state.auth.token;
  if (!token) {
    throw new Error('当前会话未认证，请重新登录后再试。');
  }
  return token;
};

export const fetchNotificationSettings = createAsyncThunk<
  NotificationSettingsResponse,
  void,
  { state: RootState }
>('notificationSettings/fetch', async (_arg, thunkAPI) => {
  const state = thunkAPI.getState();
  const token = requireToken(state);

  try {
    return await fetchNotificationSettingsRequest(token);
  } catch (error) {
    if (error instanceof NotificationSettingsApiError) {
      throw new Error(error.message);
    }
    throw error;
  }
});

export const saveNotificationSettings = createAsyncThunk<
  NotificationSettingsResponse,
  NotificationSettingsPayload,
  { state: RootState }
>('notificationSettings/save', async (payload, thunkAPI) => {
  const state = thunkAPI.getState();
  const token = requireToken(state);

  try {
    return await updateNotificationSettings(token, payload);
  } catch (error) {
    if (error instanceof NotificationSettingsApiError) {
      throw new Error(error.message);
    }
    throw error;
  }
});
