import { createAsyncThunk } from '@reduxjs/toolkit';
import { fetchServiceStatuses, fetchSystemInfo, SystemApiError, type ServiceStatusEntry, type SystemInfo } from '@services/systemApi';

export const loadSystemInfo = createAsyncThunk<SystemInfo>('system/loadInfo', async () => {
  try {
    return await fetchSystemInfo();
  } catch (error) {
    if (error instanceof SystemApiError) {
      throw new Error(error.message);
    }
    throw error;
  }
});

export const loadServiceStatuses = createAsyncThunk<ServiceStatusEntry[]>('system/loadServiceStatuses', async () => {
  try {
    return await fetchServiceStatuses();
  } catch (error) {
    if (error instanceof SystemApiError) {
      throw new Error(error.message);
    }
    throw error;
  }
});
