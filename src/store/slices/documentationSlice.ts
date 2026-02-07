import { createSlice } from '@reduxjs/toolkit';
import type { DocsAggregateSummary, RawDocsAggregateResponse, ServiceDocEntry } from '@services/documentationApi';
import { loadDocumentation } from '@store/thunks/loadDocumentation';

export type DocumentationStatus = 'idle' | 'loading' | 'succeeded' | 'failed';

interface DocumentationState {
  status: DocumentationStatus;
  summary: DocsAggregateSummary | null;
  services: ServiceDocEntry[];
  generatedAt: string | null;
  raw: RawDocsAggregateResponse | null;
  error?: string;
}

const initialState: DocumentationState = {
  status: 'idle',
  summary: null,
  services: [],
  generatedAt: null,
  raw: null
};

const documentationSlice = createSlice({
  name: 'documentation',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(loadDocumentation.pending, (state) => {
        state.status = 'loading';
        state.error = undefined;
      })
      .addCase(loadDocumentation.fulfilled, (state, action) => {
        state.status = 'succeeded';
        state.summary = action.payload.summary;
        state.services = action.payload.services;
        state.generatedAt = action.payload.generatedAt;
        state.raw = action.payload.raw;
      })
      .addCase(loadDocumentation.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.error.message ?? '加载接口文档聚合失败';
      });
  }
});

export default documentationSlice.reducer;
