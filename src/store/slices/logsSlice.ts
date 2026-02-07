import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { LogEntry } from '@services/logsApi';
import { fetchLogs, pollLogs } from '@store/thunks/logs';
import { compressLevels } from '../../utils/logLevels';

export type LogsStatus = 'idle' | 'loading' | 'succeeded' | 'failed';
export type LogsStreamStatus = 'idle' | 'polling' | 'active' | 'failed';

interface LogsFiltersState {
  levels: string[];
  start: string | null;
  end: string | null;
  search: string;
  module: string;
  requestId: string;
  range: 'today' | 'week' | 'custom';
}

export interface LogsState {
  status: LogsStatus;
  entries: LogEntry[];
  total: number;
  page: number;
  pageSize: number;
  hasNext: boolean;
  availableLevels: string[];
  availableModules: string[];
  filters: LogsFiltersState;
  error: string | null;
  sourcePath: string | null;
  sourcePaths: string[];
  sourceUpdatedAt: string | null;
  generatedAt: string | null;
  latestSequence: number | null;
  streamStatus: LogsStreamStatus;
  streamError: string | null;
  autoTail: boolean;
}

const createDefaultFilters = (): LogsFiltersState => {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  return {
    levels: [],
    start: startOfDay.toISOString(),
    end: null,
    search: '',
    module: 'all',
    requestId: '',
    range: 'today'
  };
};

const initialFilters: LogsFiltersState = createDefaultFilters();

const initialState: LogsState = {
  status: 'idle',
  entries: [],
  total: 0,
  page: 1,
  pageSize: 100,
  hasNext: false,
  availableLevels: [],
  availableModules: [],
  filters: initialFilters,
  error: null,
  sourcePath: null,
  sourcePaths: [],
  sourceUpdatedAt: null,
  generatedAt: null,
  latestSequence: null,
  streamStatus: 'idle',
  streamError: null,
  autoTail: true
};

const logsSlice = createSlice({
  name: 'logs',
  initialState,
  reducers: {
    setPage(state, action: PayloadAction<number>) {
      state.page = Math.max(action.payload, 1);
    },
    setPageSize(state, action: PayloadAction<number>) {
      state.pageSize = Math.max(Math.min(action.payload, 500), 1);
    },
    setLevels(state, action: PayloadAction<string[]>) {
      state.filters.levels = compressLevels(action.payload);
    },
    setDateRange(state, action: PayloadAction<{ start: string | null; end: string | null }>) {
      state.filters.start = action.payload.start;
      state.filters.end = action.payload.end;
    },
    setSearch(state, action: PayloadAction<string>) {
      state.filters.search = action.payload;
    },
    setModule(state, action: PayloadAction<string>) {
      state.filters.module = action.payload;
    },
    setRequestId(state, action: PayloadAction<string>) {
      state.filters.requestId = action.payload;
    },
    setRange(state, action: PayloadAction<LogsFiltersState['range']>) {
      state.filters.range = action.payload;
    },
    setAutoTail(state, action: PayloadAction<boolean>) {
      state.autoTail = action.payload;
    },
    resetFilters(state) {
      state.filters = createDefaultFilters();
      state.page = 1;
    }
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchLogs.pending, (state) => {
        state.status = 'loading';
        state.error = null;
        state.streamStatus = 'idle';
        state.streamError = null;
        state.sourcePaths = [];
      })
      .addCase(fetchLogs.fulfilled, (state, action) => {
        const previousFilters = state.filters;
        const requestedModule =
          (typeof action.meta.arg?.module === 'string' && action.meta.arg.module.trim()
            ? action.meta.arg.module.trim()
            : undefined) ?? previousFilters.module ?? 'all';
        state.status = 'succeeded';
        state.entries = action.payload.entries;
        state.total = action.payload.total;
        state.page = action.payload.page;
        state.pageSize = action.payload.pageSize;
        state.hasNext = action.payload.hasNext;
        state.availableLevels = action.payload.availableLevels;
        state.availableModules = action.payload.availableModules;
        state.filters = {
          ...previousFilters,
          module: requestedModule,
          levels: compressLevels(action.payload.filters.levels ?? []),
          start: action.payload.filters.start,
          end: action.payload.filters.end,
          search: action.payload.filters.search
        };
        state.sourcePath = action.payload.sourcePath;
        state.sourcePaths = action.payload.sourcePaths;
        state.sourceUpdatedAt = action.payload.sourceUpdatedAt;
        state.generatedAt = action.payload.generatedAt;
        state.latestSequence = action.payload.latestSequence;
        state.streamStatus = 'idle';
        state.streamError = null;
      })
      .addCase(fetchLogs.rejected, (state, action) => {
        state.status = 'failed';
        state.error = (action.payload as string) ?? action.error.message ?? '加载日志失败';
        state.streamStatus = 'failed';
        state.streamError = state.error;
        state.sourcePaths = [];
      })
      .addCase(pollLogs.pending, (state) => {
        state.streamStatus = 'polling';
        state.streamError = null;
      })
      .addCase(pollLogs.fulfilled, (state, action) => {
        if (typeof action.payload.latestSequence === 'number' && Number.isFinite(action.payload.latestSequence)) {
          state.latestSequence = action.payload.latestSequence;
        }

        if (action.payload.availableLevels.length > 0) {
          state.availableLevels = action.payload.availableLevels;
        }

        if (action.payload.availableModules.length > 0) {
          state.availableModules = action.payload.availableModules;
        }

        if (action.payload.sourcePath) {
          state.sourcePath = action.payload.sourcePath;
        }

        if (action.payload.sourcePaths.length > 0) {
          state.sourcePaths = action.payload.sourcePaths;
        }

        if (action.payload.sourceUpdatedAt) {
          state.sourceUpdatedAt = action.payload.sourceUpdatedAt;
        }

        if (action.payload.generatedAt) {
          state.generatedAt = action.payload.generatedAt;
        }

        if (state.page === 1 && action.payload.entries.length > 0) {
          const knownSequences = new Set(state.entries.map((entry) => entry.sequence));
          const newEntries = action.payload.entries.filter(
            (entry) => !knownSequences.has(entry.sequence)
          );

          if (newEntries.length > 0) {
            const combined = [...newEntries, ...state.entries];
            state.entries = combined.slice(0, state.pageSize);
            state.total += newEntries.length;
          }
        }

        state.streamStatus = 'active';
        state.streamError = null;
      })
      .addCase(pollLogs.rejected, (state, action) => {
        state.streamStatus = 'failed';
        state.streamError = (action.payload as string) ?? action.error.message ?? '实时日志更新失败';
      });
  }
});

export const {
  setPage,
  setPageSize,
  setLevels,
  setDateRange,
  setSearch,
  setModule,
  setRequestId,
  setRange,
  setAutoTail,
  resetFilters
} = logsSlice.actions;

export default logsSlice.reducer;
