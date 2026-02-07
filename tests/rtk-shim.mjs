import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const toolkit = require('@reduxjs/toolkit');

export const { createSlice, createAsyncThunk, configureStore, combineReducers } = toolkit;
export default toolkit;
