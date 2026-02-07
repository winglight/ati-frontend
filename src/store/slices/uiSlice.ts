import { createSlice, PayloadAction } from '@reduxjs/toolkit';

type ThemeMode = 'light' | 'dark';

interface UiState {
  theme: ThemeMode;
  isNavCollapsed: boolean;
}

const initialState: UiState = {
  theme: 'dark',
  isNavCollapsed: false
};

const uiSlice = createSlice({
  name: 'ui',
  initialState,
  reducers: {
    toggleTheme(state) {
      state.theme = state.theme === 'dark' ? 'light' : 'dark';
    },
    setTheme(state, action: PayloadAction<ThemeMode>) {
      state.theme = action.payload;
    },
    setNavCollapsed(state, action: PayloadAction<boolean>) {
      state.isNavCollapsed = action.payload;
    }
  }
});

export const { toggleTheme, setTheme, setNavCollapsed } = uiSlice.actions;

export default uiSlice.reducer;
