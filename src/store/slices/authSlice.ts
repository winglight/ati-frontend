import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import type { SessionUser } from '@services/authApi';
import { initializeDashboard } from '@store/thunks/initializeDashboard';
import { loadStoredSession, loginWithCredentials } from '@store/thunks/auth';
import { createPublicSession, isAnonymousAccessAllowed } from '@store/publicSession';

type AuthStatus = 'idle' | 'loading' | 'authenticated' | 'unauthenticated';

interface AuthState {
  status: AuthStatus;
  user: SessionUser | null;
  token: string | null;
  error?: string;
}

const allowAnonymous = isAnonymousAccessAllowed();

const createAnonymousSession = (): { user: SessionUser; token: string } => {
  const session = createPublicSession();
  return { user: session.user, token: session.token };
};

const createUnauthenticatedState = (): AuthState => ({
  status: 'unauthenticated',
  user: null,
  token: null
});

const createDefaultState = (): AuthState => {
  if (allowAnonymous) {
    const session = createAnonymousSession();
    return {
      status: 'authenticated',
      user: session.user,
      token: session.token
    };
  }
  return createUnauthenticatedState();
};

const initialState: AuthState = createDefaultState();

const resetToDefaultState = (state: AuthState) => {
  const nextState = createDefaultState();
  state.status = nextState.status;
  state.user = nextState.user;
  state.token = nextState.token;
};

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    setToken(state, action: PayloadAction<string | null>) {
      state.token = action.payload;
    },
    logout(state) {
      resetToDefaultState(state);
      state.error = undefined;
    }
  },
  extraReducers: (builder) => {
    builder
      .addCase(loadStoredSession.pending, (state) => {
        state.status = 'loading';
        state.error = undefined;
      })
      .addCase(loadStoredSession.fulfilled, (state, action) => {
        state.status = 'authenticated';
        state.token = action.payload.token;
        state.user = action.payload.user;
        state.error = undefined;
      })
      .addCase(loadStoredSession.rejected, (state, action) => {
        state.error = action.payload ?? action.error.message;
        resetToDefaultState(state);
      })
      .addCase(loginWithCredentials.pending, (state) => {
        state.status = 'loading';
        state.error = undefined;
      })
      .addCase(loginWithCredentials.fulfilled, (state, action) => {
        state.status = 'authenticated';
        state.token = action.payload.token;
        state.user = action.payload.user;
        state.error = undefined;
      })
      .addCase(loginWithCredentials.rejected, (state, action) => {
        state.error = action.payload ?? action.error.message;
        resetToDefaultState(state);
      })
      .addCase(initializeDashboard.pending, (state) => {
        state.status = 'loading';
        state.error = undefined;
      })
      .addCase(initializeDashboard.fulfilled, (state, action) => {
        state.status = 'authenticated';
        state.user = action.payload.user;
      })
      .addCase(initializeDashboard.rejected, (state, action) => {
        state.error = action.error.message;
        resetToDefaultState(state);
      });
  }
});

export const { setToken, logout } = authSlice.actions;

export default authSlice.reducer;
