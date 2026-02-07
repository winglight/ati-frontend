import { createSlice } from '@reduxjs/toolkit';
import type { ServiceStatusEntry, SystemInfo } from '@services/systemApi';
import { loadServiceStatuses, loadSystemInfo } from '@store/thunks/system';

type RequestStatus = 'idle' | 'loading' | 'succeeded' | 'failed';

interface SystemState {
  info: SystemInfo | null;
  services: ServiceStatusEntry[];
  infoStatus: RequestStatus;
  servicesStatus: RequestStatus;
  infoError?: string;
  servicesError?: string;
  infoUpdatedAt?: string | null;
  servicesUpdatedAt?: string | null;
}

const initialState: SystemState = {
  info: null,
  services: [],
  infoStatus: 'idle',
  servicesStatus: 'idle'
};

const systemSlice = createSlice({
  name: 'system',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(loadSystemInfo.pending, (state) => {
        state.infoStatus = 'loading';
        state.infoError = undefined;
      })
      .addCase(loadSystemInfo.fulfilled, (state, action) => {
        state.infoStatus = 'succeeded';
        state.info = action.payload;
        state.infoUpdatedAt = new Date().toISOString();
      })
      .addCase(loadSystemInfo.rejected, (state, action) => {
        state.infoStatus = 'failed';
        state.infoError = action.error.message ?? '加载系统信息失败';
      })
      .addCase(loadServiceStatuses.pending, (state) => {
        state.servicesStatus = 'loading';
        state.servicesError = undefined;
      })
      .addCase(loadServiceStatuses.fulfilled, (state, action) => {
        state.servicesStatus = 'succeeded';
        state.services = action.payload;
        state.servicesUpdatedAt = new Date().toISOString();
      })
      .addCase(loadServiceStatuses.rejected, (state, action) => {
        state.servicesStatus = 'failed';
        state.servicesError = action.error.message ?? '加载服务状态失败';
      });
  }
});

export default systemSlice.reducer;
