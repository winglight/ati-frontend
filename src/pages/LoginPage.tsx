import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import LoginDialog from '@components/auth/LoginDialog';
import { useAppDispatch, useAppSelector } from '@store/hooks';
import { loginWithCredentials } from '@store/thunks/auth';
import { isAnonymousAccessAllowed } from '@store/publicSession';

type LocationState = {
  from?: string;
};

function LoginPage() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const location = useLocation();
  const authStatus = useAppSelector((state) => state.auth.status);
  const authToken = useAppSelector((state) => state.auth.token);
  const authError = useAppSelector((state) => state.auth.error);
  const allowAnonymous = isAnonymousAccessAllowed();
  const isAuthenticated = allowAnonymous || (authStatus === 'authenticated' && Boolean(authToken));
  const state = location.state as LocationState | null;
  const redirectTarget = state?.from ?? '/';

  useEffect(() => {
    if (!isAuthenticated) {
      return;
    }
    navigate(redirectTarget, { replace: true });
  }, [isAuthenticated, navigate, redirectTarget]);

  return (
    <LoginDialog
      open
      loading={authStatus === 'loading'}
      error={authError}
      onSubmit={(credentials) => {
        void dispatch(loginWithCredentials(credentials));
      }}
    />
  );
}

export default LoginPage;
