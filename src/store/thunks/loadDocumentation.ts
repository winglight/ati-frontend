import { createAsyncThunk } from '@reduxjs/toolkit';
import type { RootState } from '@store/index';
import type { DocumentationAggregate } from '@services/documentationApi';
import { fetchDocumentationAggregate } from '@services/documentationApi';

export const loadDocumentation = createAsyncThunk<DocumentationAggregate, void, { state: RootState }>(
  'documentation/load',
  async (_, thunkAPI) => {
    const state = thunkAPI.getState();
    const token = state.auth.token;
    return fetchDocumentationAggregate(token);
  }
);
