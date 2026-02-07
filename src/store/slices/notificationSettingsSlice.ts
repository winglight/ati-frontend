import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type {
  NotificationSettingsPayload,
  NotificationSettingsResponse
} from '@services/notificationSettingsApi';
import { fetchNotificationSettings, saveNotificationSettings } from '@store/thunks/notificationSettings';

export type RequestStatus = 'idle' | 'loading' | 'succeeded' | 'failed';

export interface NotificationSettingsState {
  data: NotificationSettingsResponse | null;
  status: RequestStatus;
  saving: boolean;
  error?: string;
}

const initialState: NotificationSettingsState = {
  data: null,
  status: 'idle',
  saving: false
};

const notificationSettingsSlice = createSlice({
  name: 'notificationSettings',
  initialState,
  reducers: {
    setNotificationSettings(state, action: PayloadAction<NotificationSettingsPayload>) {
      if (!state.data) {
        state.data = {
          ...action.payload,
          moduleDefinitions: {}
        };
      } else {
        state.data = {
          ...state.data,
          ...action.payload
        };
      }
    }
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchNotificationSettings.pending, (state) => {
        state.status = 'loading';
        state.error = undefined;
      })
      .addCase(fetchNotificationSettings.fulfilled, (state, action) => {
        state.status = 'succeeded';
        state.data = action.payload;
      })
      .addCase(fetchNotificationSettings.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.error.message ?? '通知设置加载失败';
      })
      .addCase(saveNotificationSettings.pending, (state) => {
        state.saving = true;
        state.error = undefined;
      })
      .addCase(saveNotificationSettings.fulfilled, (state, action) => {
        state.saving = false;
        state.status = 'succeeded';
        state.data = action.payload;
      })
      .addCase(saveNotificationSettings.rejected, (state, action) => {
        state.saving = false;
        state.error = action.error.message ?? '通知设置保存失败';
      });
  }
});

export const { setNotificationSettings } = notificationSettingsSlice.actions;

export default notificationSettingsSlice.reducer;
