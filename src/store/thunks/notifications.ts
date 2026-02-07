import { createAsyncThunk } from '@reduxjs/toolkit';
import type { NotificationItem } from '@features/dashboard/types';
import type { RootState } from '@store/index';
import {
  listNotifications,
  acknowledgeNotification,
  acknowledgeAllNotifications as acknowledgeAllNotificationsRequest,
  deleteNotification as deleteNotificationRequest,
  NotificationsApiError,
  type NotificationListResult
} from '@services/notificationsApi';

const requireToken = (state: RootState): string => {
  const token = state.auth.token;
  if (!token) {
    throw new Error('当前会话未认证，请重新登录后再试。');
  }
  return token;
};

export interface FetchNotificationsArgs {
  limit?: number;
  unreadOnly?: boolean;
}

export interface FetchNotificationsResult extends NotificationListResult {
  receivedAt: string;
}

export const fetchNotifications = createAsyncThunk<
  FetchNotificationsResult,
  FetchNotificationsArgs | undefined,
  { state: RootState }
>('notifications/fetchNotifications', async (args, thunkAPI) => {
  const state = thunkAPI.getState();
  const token = requireToken(state);

  try {
    const response = await listNotifications(token, {
      limit: args?.limit,
      unreadOnly: args?.unreadOnly
    });

    return {
      ...response,
      receivedAt: new Date().toISOString()
    };
  } catch (error) {
    if (error instanceof NotificationsApiError) {
      throw new Error(error.message);
    }
    throw error;
  }
});

export const acknowledgeNotificationById = createAsyncThunk<
  NotificationItem,
  string,
  { state: RootState }
>('notifications/acknowledgeById', async (id, thunkAPI) => {
  const state = thunkAPI.getState();
  const token = requireToken(state);

  try {
    const record = await acknowledgeNotification(token, id);
    return record;
  } catch (error) {
    if (error instanceof NotificationsApiError) {
      throw new Error(error.message);
    }
    throw error;
  }
});

export const acknowledgeAllNotifications = createAsyncThunk<
  { updated: number },
  void,
  { state: RootState }
>('notifications/acknowledgeAll', async (_, thunkAPI) => {
  const state = thunkAPI.getState();
  const token = requireToken(state);

  try {
    const updated = await acknowledgeAllNotificationsRequest(token);
    return { updated };
  } catch (error) {
    if (error instanceof NotificationsApiError) {
      throw new Error(error.message);
    }
    throw error;
  }
});

export const deleteNotificationById = createAsyncThunk<string, string, { state: RootState }>(
  'notifications/deleteById',
  async (id, thunkAPI) => {
    const state = thunkAPI.getState();
    const token = requireToken(state);

    try {
      await deleteNotificationRequest(token, id);
      return id;
    } catch (error) {
      if (error instanceof NotificationsApiError) {
        throw new Error(error.message);
      }
      throw error;
    }
  }
);
