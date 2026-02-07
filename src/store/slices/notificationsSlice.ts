import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import type { NotificationItem } from '@features/dashboard/types';
import { initializeDashboard } from '@store/thunks/initializeDashboard';
import {
  acknowledgeAllNotifications,
  acknowledgeNotificationById,
  deleteNotificationById,
  fetchNotifications
} from '@store/thunks/notifications';

export type RequestStatus = 'idle' | 'loading' | 'succeeded' | 'failed';

interface NotificationFiltersState {
  severity: 'all' | NotificationItem['severity'];
  status: string;
  channel: string;
  unreadOnly: boolean;
  since: string | null;
  search: string;
}

interface NotificationsState {
  items: NotificationItem[];
  unreadIds: string[];
  unreadCount: number;
  total: number;
  status: RequestStatus;
  error?: string;
  lastFetchedAt?: string;
  acknowledgingIds: string[];
  deletingIds: string[];
  filters: NotificationFiltersState;
}

const initialState: NotificationsState = {
  items: [],
  unreadIds: [],
  unreadCount: 0,
  total: 0,
  status: 'idle',
  acknowledgingIds: [],
  deletingIds: [],
  filters: {
    severity: 'all',
    status: '',
    channel: '',
    unreadOnly: false,
    since: null,
    search: ''
  }
};

const sortByTimestampDesc = (a: NotificationItem, b: NotificationItem) =>
  new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();

const notificationsSlice = createSlice({
  name: 'notifications',
  initialState,
  reducers: {
    pushNotification(state, action: PayloadAction<NotificationItem>) {
      const incoming = { ...action.payload, read: action.payload.read ?? false };
      state.items = [incoming, ...state.items].slice(0, 30);
      if (!incoming.read && !state.unreadIds.includes(incoming.id)) {
        state.unreadIds.unshift(incoming.id);
        state.unreadCount += 1;
      }
      state.total += 1;
    },
    markNotificationRead(state, action: PayloadAction<string>) {
      const wasUnread = state.unreadIds.includes(action.payload);
      state.unreadIds = state.unreadIds.filter((id) => id !== action.payload);
      const index = state.items.findIndex((item) => item.id === action.payload);
      if (index !== -1) {
        state.items[index] = { ...state.items[index], read: true };
      }
      if (wasUnread && state.unreadCount > 0) {
        state.unreadCount -= 1;
      }
    },
    markAllNotificationsRead(state) {
      state.unreadIds = [];
      state.items = state.items.map((item) => ({ ...item, read: true }));
      state.unreadCount = 0;
    },
    clearNotificationsError(state) {
      state.error = undefined;
    },
    setNotificationSeverity(state, action: PayloadAction<NotificationFiltersState['severity']>) {
      state.filters.severity = action.payload;
    },
    setNotificationStatus(state, action: PayloadAction<string>) {
      state.filters.status = action.payload;
    },
    setNotificationChannel(state, action: PayloadAction<string>) {
      state.filters.channel = action.payload;
    },
    setNotificationUnreadOnly(state, action: PayloadAction<boolean>) {
      state.filters.unreadOnly = action.payload;
    },
    setNotificationSince(state, action: PayloadAction<string | null>) {
      state.filters.since = action.payload;
    },
    setNotificationSearch(state, action: PayloadAction<string>) {
      state.filters.search = action.payload;
    },
    resetNotificationFilters(state) {
      state.filters = { ...initialState.filters };
    }
  },
  extraReducers: (builder) => {
    builder
      .addCase(initializeDashboard.pending, (state) => {
        state.status = 'loading';
        state.error = undefined;
        state.acknowledgingIds = [];
        state.deletingIds = [];
      })
      .addCase(initializeDashboard.fulfilled, (state, action) => {
        const notifications = [...action.payload.snapshot.notifications].sort(sortByTimestampDesc);
        const existing = state.items.filter(
          (item) => !notifications.some((incoming) => incoming.id === item.id)
        );
        state.items = [...notifications, ...existing].slice(0, 100);
        state.unreadIds = state.items.filter((item) => !item.read).map((item) => item.id);
        const overview = action.payload.notificationsOverview;
        state.unreadCount = state.unreadIds.length;
        state.total = Math.max(overview?.total ?? notifications.length, state.items.length);
        state.lastFetchedAt = overview?.receivedAt ?? new Date().toISOString();
        state.status = 'succeeded';
        state.acknowledgingIds = [];
        state.deletingIds = [];
      })
      .addCase(initializeDashboard.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.error.message;
      })
      .addCase(fetchNotifications.pending, (state) => {
        state.status = 'loading';
        state.error = undefined;
      })
      .addCase(fetchNotifications.fulfilled, (state, action) => {
        const notifications = [...action.payload.items].sort(sortByTimestampDesc);
        const existing = state.items.filter(
          (item) => !notifications.some((incoming) => incoming.id === item.id)
        );
        state.items = [...notifications, ...existing].slice(0, 100);
        state.unreadIds = state.items.filter((item) => !item.read).map((item) => item.id);
        state.unreadCount = state.unreadIds.length;
        state.total = Math.max(action.payload.total, state.items.length);
        state.lastFetchedAt = action.payload.receivedAt;
        state.status = 'succeeded';
        state.acknowledgingIds = [];
        state.deletingIds = [];
      })
      .addCase(fetchNotifications.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.error.message ?? '通知列表加载失败';
      })
      .addCase(acknowledgeNotificationById.pending, (state, action) => {
        if (!state.acknowledgingIds.includes(action.meta.arg)) {
          state.acknowledgingIds.push(action.meta.arg);
        }
        state.error = undefined;
      })
      .addCase(acknowledgeNotificationById.fulfilled, (state, action) => {
        const id = action.meta.arg;
        state.acknowledgingIds = state.acknowledgingIds.filter((item) => item !== id);
        const index = state.items.findIndex((item) => item.id === id);
        const existing = index !== -1 ? state.items[index] : undefined;
        const wasUnread = existing ? !existing.read : state.unreadIds.includes(id);
        if (index !== -1) {
          state.items[index] = { ...state.items[index], ...action.payload, read: true };
        }
        state.unreadIds = state.unreadIds.filter((itemId) => itemId !== id);
        if (wasUnread && state.unreadCount > 0) {
          state.unreadCount -= 1;
        }
      })
      .addCase(acknowledgeNotificationById.rejected, (state, action) => {
        const id = action.meta.arg;
        state.acknowledgingIds = state.acknowledgingIds.filter((item) => item !== id);
        state.error = action.error.message ?? '标记通知已读失败';
      })
      .addCase(acknowledgeAllNotifications.pending, (state) => {
        state.error = undefined;
      })
      .addCase(acknowledgeAllNotifications.fulfilled, (state) => {
        state.items = state.items.map((item) => ({ ...item, read: true }));
        state.unreadIds = [];
        state.unreadCount = 0;
        state.lastFetchedAt = new Date().toISOString();
      })
      .addCase(acknowledgeAllNotifications.rejected, (state, action) => {
        state.error = action.error.message ?? '全部标记已读失败';
      })
      .addCase(deleteNotificationById.pending, (state, action) => {
        if (!state.deletingIds.includes(action.meta.arg)) {
          state.deletingIds.push(action.meta.arg);
        }
        state.error = undefined;
      })
      .addCase(deleteNotificationById.fulfilled, (state, action) => {
        const id = action.payload;
        state.deletingIds = state.deletingIds.filter((item) => item !== id);
        const existing = state.items.find((item) => item.id === id);
        state.items = state.items.filter((item) => item.id !== id);
        state.unreadIds = state.unreadIds.filter((itemId) => itemId !== id);
        state.total = Math.max(0, state.total - 1);
        if (state.unreadCount > 0 && existing && !existing.read) {
          state.unreadCount = Math.max(0, state.unreadCount - 1);
        }
      })
      .addCase(deleteNotificationById.rejected, (state, action) => {
        const id = action.meta.arg;
        state.deletingIds = state.deletingIds.filter((item) => item !== id);
        state.error = action.error.message ?? '删除通知失败';
      });
  }
});

export const {
  pushNotification,
  markNotificationRead,
  markAllNotificationsRead,
  clearNotificationsError,
  setNotificationSeverity,
  setNotificationStatus,
  setNotificationChannel,
  setNotificationUnreadOnly,
  setNotificationSince,
  setNotificationSearch,
  resetNotificationFilters
} = notificationsSlice.actions;

export default notificationsSlice.reducer;
