import { createSlice, PayloadAction } from '@reduxjs/toolkit';

export type ToastVariant = 'success' | 'error' | 'info';

export interface ToastItem {
  id: string;
  message: string;
  variant: ToastVariant;
  duration?: number;
}

interface ToastPayload extends ToastItem {
  preventDuplicates?: boolean;
}

interface ToastState {
  items: ToastItem[];
}

const initialState: ToastState = {
  items: []
};

const DEFAULT_DURATION = 4000;

const toastSlice = createSlice({
  name: 'toast',
  initialState,
  reducers: {
    addToast: {
      reducer(state, action: PayloadAction<ToastPayload>) {
        const { preventDuplicates, ...toast } = action.payload;
        if (
          preventDuplicates &&
          state.items.some((item) => item.message === toast.message && item.variant === toast.variant)
        ) {
          return;
        }
        state.items.push(toast);
      },
      prepare(payload: { message: string; variant?: ToastVariant; duration?: number; preventDuplicates?: boolean }) {
        const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
        return {
          payload: {
            id,
            message: payload.message,
            variant: payload.variant ?? 'info',
            duration: payload.duration ?? DEFAULT_DURATION,
            preventDuplicates: payload.preventDuplicates ?? false
          }
        };
      }
    },
    removeToast(state, action: PayloadAction<string>) {
      state.items = state.items.filter((item) => item.id !== action.payload);
    },
    clearToasts(state) {
      state.items = [];
    }
  }
});

export const { addToast, removeToast, clearToasts } = toastSlice.actions;
export default toastSlice.reducer;
