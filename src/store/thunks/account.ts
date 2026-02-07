import { createAsyncThunk } from '@reduxjs/toolkit';
import {
  fetchAccountSummary,
  fetchAccountPositions,
  mapAccountSummary,
  mapAccountPositions,
  isAccountServiceUnavailable,
  mergeServiceWarnings,
  ACCOUNT_SERVICE_OFFLINE_MESSAGE
} from '@services/accountApi';
import type { RootState } from '@store/index';
import { setAccountServiceWarning, setAccountSummary, setPositions } from '@store/slices/accountSlice';

const requireToken = (state: RootState): string => {
  const token = state.auth.token;
  if (!token) {
    throw new Error('缺少访问令牌，无法刷新账户信息');
  }
  return token;
};

export const refreshAccountSummary = createAsyncThunk<void, void, { state: RootState }>(
  'account/refreshSummary',
  async (_, thunkAPI) => {
    const token = requireToken(thunkAPI.getState());
    const result = await fetchAccountSummary(token);
    if (isAccountServiceUnavailable(result.serviceStatus)) {
      thunkAPI.dispatch(
        setAccountServiceWarning(result.serviceStatus?.trim() || ACCOUNT_SERVICE_OFFLINE_MESSAGE)
      );
      return;
    }
    thunkAPI.dispatch(setAccountSummary(mapAccountSummary(result.data)));
    thunkAPI.dispatch(setAccountServiceWarning(mergeServiceWarnings(result.serviceStatus)));
  }
);

export const refreshAccountPositions = createAsyncThunk<void, void, { state: RootState }>(
  'account/refreshPositions',
  async (_, thunkAPI) => {
    const token = requireToken(thunkAPI.getState());
    const result = await fetchAccountPositions(token);
    if (isAccountServiceUnavailable(result.serviceStatus)) {
      thunkAPI.dispatch(
        setAccountServiceWarning(result.serviceStatus?.trim() || ACCOUNT_SERVICE_OFFLINE_MESSAGE)
      );
      return;
    }
    thunkAPI.dispatch(setPositions(mapAccountPositions(result.data)));
    thunkAPI.dispatch(setAccountServiceWarning(mergeServiceWarnings(result.serviceStatus)));
  }
);
