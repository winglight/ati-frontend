import { createAsyncThunk } from '@reduxjs/toolkit';
import type { RootState } from '@store/index';
import {
  type LogQueryParams,
  type LogQueryResult,
  type LogStreamParams,
  type LogStreamResult,
  LogsApiError,
  fetchLogs as fetchLogsRequest,
  streamLogs as streamLogsRequest
} from '@services/logsApi';
import { expandLevels } from '../../utils/logLevels';

export interface FetchLogsArgs extends Partial<LogQueryParams> {}

export const fetchLogs = createAsyncThunk<
  LogQueryResult,
  FetchLogsArgs | undefined,
  { state: RootState; rejectValue: string }
>('logs/fetchLogs', async (params, { getState, rejectWithValue }) => {
  const state = getState();
  const current = state.logs;

  const requestedLevels = params?.levels ?? current.filters.levels;
  const effectiveLevels = expandLevels(requestedLevels ?? []);

  const query: LogQueryParams = {
    page: params?.page ?? current.page,
    pageSize: params?.pageSize ?? current.pageSize,
    levels: effectiveLevels,
    start: params?.start ?? current.filters.start,
    end: params?.end ?? current.filters.end,
    search: params?.search ?? (current.filters.search || undefined),
    module: params?.module ?? current.filters.module ?? 'all'
  };

  // Strip empty arrays to avoid sending redundant params
  if (query.levels && query.levels.length === 0) {
    delete query.levels;
  }
  if (!query.search) {
    delete query.search;
  }
  if (!query.start) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    query.start = today.toISOString();
  }

  try {
    return await fetchLogsRequest(query);
  } catch (error) {
    if (error instanceof LogsApiError) {
      return rejectWithValue(error.message);
    }
    throw error;
  }
});

export const pollLogs = createAsyncThunk<
  LogStreamResult,
  void,
  { state: RootState; rejectValue: string }
>(
  'logs/pollLogs',
  async (_payload, { getState, rejectWithValue }) => {
    const state = getState().logs;

    const expandedLevels = expandLevels(state.filters.levels ?? []);

    const params: LogStreamParams = {
      limit: state.pageSize,
      levels: expandedLevels.length > 0 ? expandedLevels : undefined,
      start: state.filters.start ?? undefined,
      end: state.filters.end ?? undefined,
      search: state.filters.search ? state.filters.search : undefined,
      module: state.filters.module ?? 'all'
    };

    if (state.latestSequence !== null && Number.isFinite(state.latestSequence)) {
      params.afterSequence = state.latestSequence;
    }

    try {
      return await streamLogsRequest(params);
    } catch (error) {
      if (error instanceof LogsApiError) {
        return rejectWithValue(error.message);
      }
      throw error;
    }
  },
  {
    condition: (_, { getState }) => {
      const state = getState().logs;
      return state.page === 1 && state.autoTail;
    },
  }
);
